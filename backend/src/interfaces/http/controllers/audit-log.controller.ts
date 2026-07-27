// AuditLog Controller — Flow 6b: đọc nhật ký (chỉ GĐ/KTTH/Auditor)
// Layer: Interface (HTTP)
// BR-F12.10-03: chỉ ADMIN(GĐ), MANAGER(KTTH), AUDITOR được xem.

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { ListAuditUseCase } from '../../../application/use-cases/audit/list-audit.use-case';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AUDITOR)
export class AuditLogController {
  constructor(private readonly listAudit: ListAuditUseCase) {}

  @Get()
  list(
    @Query('userId') userId?: string,
    @Query('entityType') entityType?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.listAudit.execute({ userId, entityType, action, from, to });
  }
}
