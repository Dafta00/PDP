import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import ms from '../common/utils/ms';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { OrgScopeService } from '../common/scope/org-scope.service';
import { AuthorizationService } from '../common/authorization/authorization.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly orgScope: OrgScopeService,
    private readonly authorization: AuthorizationService,
  ) {}

  async login(email: string, password: string, meta?: { ip?: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    const passwordValid = user ? await bcrypt.compare(password, user.passwordHash) : false;

    if (!user || !passwordValid || user.status !== 'ACTIVE') {
      await this.auditService.record({
        actorId: user?.id ?? null,
        action: AuditAction.LOGIN_FAILED,
        entityType: 'User',
        entityId: user?.id ?? null,
        metadata: { email, ip: meta?.ip },
      });
      throw new UnauthorizedException('Invalid email or password.');
    }

    const tokens = await this.issueTokens(user.id);

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    await this.auditService.record({
      actorId: user.id,
      action: AuditAction.LOGIN_SUCCESS,
      entityType: 'User',
      entityId: user.id,
      metadata: { ip: meta?.ip },
    });

    const additionalScopes = await this.prisma.userScope.findMany({
      where: { userId: user.id },
      select: { senatorialDistrictId: true, lgaId: true, wardId: true, pollingUnitId: true },
    });
    const authenticatedUser = this.toAuthenticatedUser(user, additionalScopes);
    const [scopePath, permissions] = await Promise.all([
      this.orgScope.resolveScopePath(authenticatedUser),
      this.authorization.getEffectivePermissions(authenticatedUser),
    ]);

    return {
      ...tokens,
      user: { ...authenticatedUser, scopePath, permissions: Array.from(permissions).sort() },
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }

    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || stored.userId !== payload.sub) {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }

    const tokens = await this.issueTokens(user.id);

    await this.auditService.record({
      actorId: user.id,
      action: AuditAction.TOKEN_REFRESHED,
      entityType: 'User',
      entityId: user.id,
    });

    return tokens;
  }

  async logout(refreshToken: string, actorId?: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.auditService.record({
      actorId: actorId ?? null,
      action: AuditAction.LOGOUT,
      entityType: 'User',
      entityId: actorId ?? null,
    });
  }

  private async issueTokens(userId: string): Promise<TokenPair> {
    const accessToken = await this.jwtService.signAsync(
      { sub: userId },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
      },
    );

    const refreshToken = await this.jwtService.signAsync(
      { sub: userId },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
      },
    );

    const expiresAt = new Date(Date.now() + ms(process.env.JWT_REFRESH_EXPIRES_IN ?? '7d'));

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  private toAuthenticatedUser(user: {
    id: string;
    email: string;
    role: AuthenticatedUser['role'];
    senatorialDistrictId: string | null;
    lgaId: string | null;
    wardId: string | null;
    pollingUnitId: string | null;
    fullName: string;
    canCreateUsers: boolean;
  }, additionalScopes: AuthenticatedUser['additionalScopes'] = []) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      senatorialDistrictId: user.senatorialDistrictId,
      lgaId: user.lgaId,
      wardId: user.wardId,
      pollingUnitId: user.pollingUnitId,
      canCreateUsers: user.canCreateUsers,
      additionalScopes,
    };
  }
}
