// Use Case: Đọc Audit Log (Flow 6b)
// Layer: Application

import { Injectable, Inject } from '@nestjs/common';
import { IAuditRepository } from '../../../domain/repositories/audit.repository';

@Injectable()
export class ListAuditUseCase {
  constructor(@Inject('IAuditRepository') private readonly audit: IAuditRepository) {}

  execute(query: { userId?: string; entityType?: string; action?: string; from?: string; to?: string }) {
    return this.audit.list({
      userId: query.userId,
      entityType: query.entityType,
      action: query.action,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
  }
}
