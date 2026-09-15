import { BadRequestException } from '@nestjs/common';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const buildController = (overrides: {
    heartbeatUseCase?: any;
    forceLogoutStaffUseCase?: any;
  } = {}) => {
    const loginUseCase = { execute: jest.fn() };
    const createUserUseCase = { execute: jest.fn() };
    const changePasswordUseCase = { execute: jest.fn() };
    const refreshTokenUseCase = { execute: jest.fn() };
    const notifications = { notifyUsers: jest.fn() };
    const authSessionRepo = { revokeById: jest.fn(), findById: jest.fn() };
    const heartbeatUseCase = overrides.heartbeatUseCase ?? { execute: jest.fn() };
    const forceLogoutStaffUseCase = overrides.forceLogoutStaffUseCase ?? { execute: jest.fn() };

    const controller = new AuthController(
      loginUseCase as any,
      createUserUseCase as any,
      changePasswordUseCase as any,
      refreshTokenUseCase as any,
      notifications as any,
      authSessionRepo as any,
      heartbeatUseCase as any,
      forceLogoutStaffUseCase as any,
    );

    return { controller, heartbeatUseCase, forceLogoutStaffUseCase };
  };

  describe('heartbeat', () => {
    it('calls HeartbeatUseCase with req.user.sessionId and returns ISO expiresAt', async () => {
      const expiresAt = new Date('2026-09-15T12:00:00.000Z');
      const heartbeatUseCase = {
        execute: jest.fn().mockResolvedValue({ sessionId: 's1', isStale: false, expiresAt }),
      };
      const { controller } = buildController({ heartbeatUseCase });

      const result = await controller.heartbeat({ user: { sessionId: 's1' } });

      expect(heartbeatUseCase.execute).toHaveBeenCalledWith('s1');
      expect(result.expiresAt).toBe(expiresAt.toISOString());
      expect(typeof result.expiresAt).toBe('string');
      expect(result).toEqual({ sessionId: 's1', isStale: false, expiresAt: expiresAt.toISOString() });
    });

    it('throws BadRequestException if req.user has no sessionId', async () => {
      const heartbeatUseCase = { execute: jest.fn() };
      const { controller } = buildController({ heartbeatUseCase });

      await expect(controller.heartbeat({ user: {} })).rejects.toThrow(BadRequestException);
      expect(heartbeatUseCase.execute).not.toHaveBeenCalled();
    });
  });

  describe('forceLogoutStaff', () => {
    it('calls ForceLogoutStaffUseCase with requester id and target sessionId', async () => {
      const forceLogoutStaffUseCase = {
        execute: jest.fn().mockResolvedValue({ revokedSessionId: 's2', userId: 'u2', branchId: 'b1' }),
      };
      const { controller } = buildController({ forceLogoutStaffUseCase });

      const result = await controller.forceLogoutStaff({ user: { id: 'mgr-1' } }, 's2');

      expect(forceLogoutStaffUseCase.execute).toHaveBeenCalledWith('mgr-1', 's2');
      expect(result).toEqual({ revokedSessionId: 's2', userId: 'u2', branchId: 'b1' });
    });
  });
});
