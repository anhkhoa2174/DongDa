import { Injectable } from '@nestjs/common';
import { UserRole } from '../../domain/entities/user.entity';
import { PrismaService } from '../database/prisma.service';

type NotificationDb = Pick<PrismaService, 'user' | 'notifications'>;

export type NotificationPayload = {
  title: string;
  body?: string | null;
  sourceType: string;
  sourceId?: string | null;
};

type RecipientFilter = {
  userIds?: string[];
  roles?: string[];
  branchIds?: string[];
  branchRoles?: string[];
  excludeUserIds?: string[];
};

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async notifyUsers(
    payload: NotificationPayload,
    filter: RecipientFilter,
    db: NotificationDb = this.prisma,
  ) {
    const explicitUserIds = filter.userIds ?? [];
    const shouldResolveUsers = Boolean(filter.roles?.length || filter.branchIds?.length);
    const audienceConditions = [
      ...(filter.roles?.length
        ? [{ user_roles: { some: { roles: { code: { in: filter.roles } } } } }]
        : []),
      ...(filter.branchIds?.length
        ? [{
            AND: [
              { employees: { branch_id: { in: filter.branchIds }, status: 'ACTIVE' as const } },
              {
                user_roles: {
                  some: {
                    roles: { code: { in: filter.branchRoles?.length ? filter.branchRoles : [UserRole.STAFF] } },
                  },
                },
              },
            ],
          }]
        : []),
    ];
    const matchedUsers = shouldResolveUsers
      ? await db.user.findMany({
          where: {
            status: 'ACTIVE',
            OR: audienceConditions,
          },
          select: { id: true },
        })
      : [];
    const excluded = new Set(filter.excludeUserIds ?? []);
    const recipientIds = [...new Set([...explicitUserIds, ...matchedUsers.map((user) => user.id)])]
      .filter((id) => !excluded.has(id));

    if (recipientIds.length === 0) return 0;
    const created = await db.notifications.createMany({
      data: recipientIds.map((recipientUserId) => ({
        recipient_user_id: recipientUserId,
        title: payload.title,
        body: payload.body ?? null,
        source_type: payload.sourceType,
        source_id: payload.sourceId ?? null,
      })),
    });
    return created.count;
  }
}
