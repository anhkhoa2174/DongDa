import { Prisma } from '@prisma/client';
import { PrismaAuthSessionRepository } from './prisma-auth-session.repository';
import { UserRole } from '../../../domain/entities/user.entity';

// In-memory fake của bảng auth_sessions — mô phỏng các thao tác Prisma repo dùng,
// theo đúng convention của các *.repository.spec.ts khác trong thư mục này (mock PrismaService
// bằng object thuần + jest.fn(), không cần kết nối DB thật).
function createFakePrisma() {
  const rows: any[] = [];
  let seq = 0;

  function matches(row: any, where: any): boolean {
    return Object.entries(where ?? {}).every(([key, condition]) => {
      const value = row[key];
      if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
        if ('gt' in (condition as any)) return value > (condition as any).gt;
        if ('lt' in (condition as any)) return value < (condition as any).lt;
        if ('not' in (condition as any)) return value !== (condition as any).not;
      }
      return value === condition;
    });
  }

  return {
    __rows: rows,
    auth_sessions: {
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `session-${++seq}`,
          user_id: data.user_id,
          branch_id: data.branch_id,
          role: data.role,
          status: data.status,
          refresh_token_hash: data.refresh_token_hash,
          device_ip: data.device_ip ?? null,
          user_agent: data.user_agent ?? null,
          last_heartbeat_at: data.last_heartbeat_at,
          expires_at: data.expires_at,
        };
        rows.push(row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null),
      findMany: jest.fn(async ({ where }: any) => rows.filter((r) => matches(r, where))),
      update: jest.fn(async ({ where, data }: any) => {
        const row = rows.find((r) => r.id === where.id);
        if (!row) {
          throw new Prisma.PrismaClientKnownRequestError('Record to update not found.', {
            code: 'P2025',
            clientVersion: '5.0.0',
          });
        }
        Object.assign(row, data);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const matched = rows.filter((r) => matches(r, where));
        matched.forEach((r) => Object.assign(r, data));
        return { count: matched.length };
      }),
      count: jest.fn(async ({ where }: any) => rows.filter((r) => matches(r, where)).length),
    },
  };
}

describe('PrismaAuthSessionRepository', () => {
  const future = new Date(Date.now() + 60 * 60 * 1000);

  function buildRepo() {
    const prisma = createFakePrisma();
    const repo = new PrismaAuthSessionRepository(prisma as any);
    return { repo, prisma };
  }

  it('create() stores and returns a session with status ACTIVE', async () => {
    const { repo } = buildRepo();

    const session = await repo.create({
      userId: 'user-1',
      branchId: 'branch-1',
      role: UserRole.STAFF,
      refreshTokenHash: 'hash-1',
      expiresAt: future,
    });

    expect(session.status).toBe('ACTIVE');
    expect(session.userId).toBe('user-1');
    expect(session.branchId).toBe('branch-1');
    expect(session.role).toBe(UserRole.STAFF);
  });

  it('revokeById() marks a session REVOKED, confirmed by a subsequent findById()', async () => {
    const { repo } = buildRepo();
    const session = await repo.create({
      userId: 'user-1',
      branchId: 'branch-1',
      role: UserRole.STAFF,
      refreshTokenHash: 'hash-1',
      expiresAt: future,
    });

    await repo.revokeById(session.id);

    const found = await repo.findById(session.id);
    expect(found?.status).toBe('REVOKED');
  });

  it('countActiveStaffByBranch() only counts ACTIVE sessions with a future expiresAt', async () => {
    const { repo } = buildRepo();
    await repo.create({
      userId: 'user-1',
      branchId: 'branch-1',
      role: UserRole.STAFF,
      refreshTokenHash: 'hash-1',
      expiresAt: future,
    });
    const revoked = await repo.create({
      userId: 'user-2',
      branchId: 'branch-1',
      role: UserRole.STAFF,
      refreshTokenHash: 'hash-2',
      expiresAt: future,
    });
    await repo.revokeById(revoked.id);

    const count = await repo.countActiveStaffByBranch('branch-1');
    expect(count).toBe(1);
  });

  it('findActiveByBranchAndRole() filters by both branch AND role', async () => {
    const { repo } = buildRepo();
    await repo.create({
      userId: 'user-1',
      branchId: 'branch-A',
      role: UserRole.STAFF,
      refreshTokenHash: 'hash-1',
      expiresAt: future,
    });
    await repo.create({
      userId: 'user-2',
      branchId: 'branch-B',
      role: UserRole.STAFF,
      refreshTokenHash: 'hash-2',
      expiresAt: future,
    });

    const result = await repo.findActiveByBranchAndRole('branch-A', UserRole.STAFF);

    expect(result).toHaveLength(1);
    expect(result[0].branchId).toBe('branch-A');
  });

  it('updateHeartbeat() returns null when the session no longer exists (P2025)', async () => {
    const { repo } = buildRepo();

    const result = await repo.updateHeartbeat('missing-session');

    expect(result).toBeNull();
  });

  it('revokeStaleHeartbeatSessions() only revokes ACTIVE sessions with a stale last_heartbeat_at', async () => {
    const { repo, prisma } = buildRepo();
    const stale = await repo.create({
      userId: 'user-1',
      branchId: 'branch-1',
      role: UserRole.STAFF,
      refreshTokenHash: 'hash-1',
      expiresAt: future,
    });
    const fresh = await repo.create({
      userId: 'user-2',
      branchId: 'branch-1',
      role: UserRole.STAFF,
      refreshTokenHash: 'hash-2',
      expiresAt: future,
    });
    const staleRow = prisma.__rows.find((r: any) => r.id === stale.id);
    staleRow.last_heartbeat_at = new Date(Date.now() - 10 * 60 * 1000); // 10 phút trước

    const count = await repo.revokeStaleHeartbeatSessions(300); // ngưỡng 5 phút

    expect(count).toBe(1);
    const staleFound = await repo.findById(stale.id);
    const freshFound = await repo.findById(fresh.id);
    expect(staleFound?.status).toBe('EXPIRED');
    expect(freshFound?.status).toBe('ACTIVE');
  });
});
