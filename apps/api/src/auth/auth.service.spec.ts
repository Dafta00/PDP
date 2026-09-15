import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

jest.mock('bcryptjs');

function makeDeps() {
  const prisma = {
    user: { findUnique: jest.fn() },
    refreshToken: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  };
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('signed-token'),
    verifyAsync: jest.fn(),
  };
  const auditService = { record: jest.fn() };
  return { prisma, jwtService, auditService };
}

const ACTIVE_USER = {
  id: 'user-1',
  email: 'admin@pdpgombecentral.org',
  passwordHash: 'hashed',
  fullName: 'Admin',
  role: 'SUPER_ADMIN',
  status: 'ACTIVE',
  lgaId: null,
  wardId: null,
  pollingUnitId: null,
};

describe('AuthService.login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an unknown email without revealing whether the account exists', async () => {
    const { prisma, jwtService, auditService } = makeDeps();
    prisma.user.findUnique.mockResolvedValue(null);
    const service = new AuthService(prisma as any, jwtService as any, auditService as any);

    await expect(service.login('nobody@example.com', 'whatever')).rejects.toThrow(UnauthorizedException);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGIN_FAILED' }),
    );
  });

  it('rejects a wrong password', async () => {
    const { prisma, jwtService, auditService } = makeDeps();
    prisma.user.findUnique.mockResolvedValue(ACTIVE_USER);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    const service = new AuthService(prisma as any, jwtService as any, auditService as any);

    await expect(service.login(ACTIVE_USER.email, 'wrong')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a disabled account even with the correct password', async () => {
    const { prisma, jwtService, auditService } = makeDeps();
    prisma.user.findUnique.mockResolvedValue({ ...ACTIVE_USER, status: 'DISABLED' });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const service = new AuthService(prisma as any, jwtService as any, auditService as any);

    await expect(service.login(ACTIVE_USER.email, 'correct')).rejects.toThrow(UnauthorizedException);
  });

  it('issues a token pair and logs LOGIN_SUCCESS on valid credentials', async () => {
    const { prisma, jwtService, auditService } = makeDeps();
    prisma.user.findUnique.mockResolvedValue(ACTIVE_USER);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const service = new AuthService(prisma as any, jwtService as any, auditService as any);

    const result = await service.login(ACTIVE_USER.email, 'correct');

    expect(result.accessToken).toBe('signed-token');
    expect(result.refreshToken).toBe('signed-token');
    expect(result.user.id).toBe(ACTIVE_USER.id);
    expect(prisma.refreshToken.create).toHaveBeenCalled();
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGIN_SUCCESS', actorId: ACTIVE_USER.id }),
    );
  });
});
