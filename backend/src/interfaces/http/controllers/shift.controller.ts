// Shift Controller — Ca làm việc + Kiểm quỹ (F8)
// Layer: Interface (HTTP)
//   GET  /shifts/current?branchId   ca đang mở + kiểm quỹ
//   POST /shifts/open               mở ca + kiểm quỹ đầu ca
//   POST /shifts/:id/close          đóng ca + kiểm quỹ cuối ca (khớp/thừa/thiếu)

import { Controller, Post, Get, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { OpenShiftUseCase, CloseShiftUseCase, CurrentShiftUseCase } from '../../../application/use-cases/shift/shift.use-cases';
import { OpenShiftDto, CloseShiftDto } from '../../../application/dtos/shift/shift.dto';

@Controller('shifts')
@UseGuards(JwtAuthGuard)
export class ShiftController {
  constructor(
    private readonly openShift: OpenShiftUseCase,
    private readonly closeShift: CloseShiftUseCase,
    private readonly currentShift: CurrentShiftUseCase,
  ) {}

  @Get('current')
  current(@Query('branchId') branchId: string) {
    return this.currentShift.execute(branchId);
  }

  @Post('open')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  open(@Request() req: any, @Body() dto: OpenShiftDto) {
    return this.openShift.execute(dto, req.user.id);
  }

  @Post(':id/close')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  close(@Request() req: any, @Param('id') id: string, @Body() dto: CloseShiftDto) {
    return this.closeShift.execute(id, dto, req.user.id);
  }
}
