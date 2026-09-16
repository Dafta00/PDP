import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

interface JwtPayload {
  sub: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET as string,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Session is no longer valid.');
    }
    const additionalScopes = await this.prisma.userScope.findMany({
      where: { userId: user.id },
      select: { senatorialDistrictId: true, lgaId: true, wardId: true, pollingUnitId: true },
    });
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
