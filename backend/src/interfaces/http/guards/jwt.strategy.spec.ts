import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '../../../domain/entities/user.entity';
import { AuthSessionEntity } from '../../../domain/entities/auth-session.entity';
import { JwtStrategy } from './jwt.strategy';

const activeUser = {
  id: 'u1',
  username: 'staff1',
  password: 'hashed',
  role: UserRole.STAFF,
  branchId: 'b1',
  isActive: true,
};

function makeSession(overrides: Partial<ConstructorParameters<typeof AuthSessionEntity>[0]> = {}) {
  return new AuthSessionEntity({
    id: 's1',
    userId: 'u1',
    branchId: 'b1',
    role: UserRole.STAFF,
    status: 'ACTIVE',
    refreshTokenHash: 'hash',
    lastHeartbeatAt: new Date(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    ...overrides,
  });
}

describe('JwtStrategy.validate', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
  });

  it('attaches sessionId to the returned user when payload has one and the session is valid', async () => {
    const userRepo = { findById: jest.fn().mockResolvedValue(activeUser) };
    const authSessionRepo = { findById: jest.fn().mockResolvedValue(makeSession()) };
    const strategy = new JwtStrategy(userRepo as any, authSessionRepo as any);

    const result = await strategy.validate({
      sub: 'u1',
      role: 'STAFF',
      branchId: 'b1',
      sessionId: 's1',
      type: 'access',
    });

    expect(result.sessionId).toBe('s1');
    expect((result as any).password).toBeUndefined();
    expect(authSessionRepo.findById).toHaveBeenCalledWith('s1');
  });

  it('rejects when the session has been revoked', async () => {
    const userRepo = { findById: jest.fn().mockResolvedValue(activeUser) };
    const authSessionRepo = { findById: jest.fn().mockResolvedValue(makeSession({ status: 'REVOKED' })) };
    const strategy = new JwtStrategy(userRepo as any, authSessionRepo as any);

    await expect(
      strategy.validate({ sub: 'u1', role: 'STAFF', branchId: 'b1', sessionId: 's1', type: 'access' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects when session.userId does not match the token's sub", async () => {
    const userRepo = { findById: jest.fn().mockResolvedValue(activeUser) };
    const authSessionRepo = {
      findById: jest.fn().mockResolvedValue(makeSession({ userId: 'someone-else' })),
    };
    const strategy = new JwtStrategy(userRepo as any, authSessionRepo as any);

    await expect(
      strategy.validate({ sub: 'u1', role: 'STAFF', branchId: 'b1', sessionId: 's1', type: 'access' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the session does not exist', async () => {
    const userRepo = { findById: jest.fn().mockResolvedValue(activeUser) };
    const authSessionRepo = { findById: jest.fn().mockResolvedValue(null) };
    const strategy = new JwtStrategy(userRepo as any, authSessionRepo as any);

    await expect(
      strategy.validate({ sub: 'u1', role: 'STAFF', branchId: 'b1', sessionId: 's1', type: 'access' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('skips session validation entirely when the payload has no sessionId (backward compat)', async () => {
    const userRepo = { findById: jest.fn().mockResolvedValue({ ...activeUser, role: UserRole.ADMIN, branchId: null }) };
    const authSessionRepo = { findById: jest.fn() };
    const strategy = new JwtStrategy(userRepo as any, authSessionRepo as any);

    const result = await strategy.validate({ sub: 'u1', role: 'ADMIN', branchId: null, type: 'access' });

    expect(result).toBeDefined();
    expect(authSessionRepo.findById).not.toHaveBeenCalled();
  });

  it('preserves existing behavior: rejects a refresh token used as access token', async () => {
    const userRepo = { findById: jest.fn() };
    const authSessionRepo = { findById: jest.fn() };
    const strategy = new JwtStrategy(userRepo as any, authSessionRepo as any);

    await expect(
      strategy.validate({ sub: 'u1', role: 'STAFF', branchId: 'b1', type: 'refresh' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(userRepo.findById).not.toHaveBeenCalled();
  });
});
