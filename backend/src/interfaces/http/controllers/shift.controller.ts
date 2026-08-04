// Shift Controller — Ca làm việc + Kiểm quỹ (F8)
// Layer: Interface (HTTP)
//   GET  /shifts/current?branchId   ca đang mở + kiểm quỹ
//   POST /shifts/open               mở ca + kiểm quỹ đầu ca
//   POST /shifts/:id/close          đóng ca + kiểm quỹ cuối ca (khớp/thừa/thiếu)

import { BadRequestException, Controller, Post, Get, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { BranchAccessGuard } from '../guards/branch-access.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { OpenShiftUseCase, CloseShiftUseCase, CurrentShiftUseCase } from '../../../application/use-cases/shift/shift.use-cases';
import { OpenShiftDto, CloseShiftDto } from '../../../application/dtos/shift/shift.dto';

@Controller('shifts')
@UseGuards(JwtAuthGuard, BranchAccessGuard)
export class ShiftController {
  constructor(
    private readonly openShift: OpenShiftUseCase,
    private readonly closeShift: CloseShiftUseCase,
    private readonly currentShift: CurrentShiftUseCase,
  ) {}

  @Get('current')
  current(@Request() req: any, @Query('branchId') branchId: string) {
    if (req.user?.role === UserRole.STAFF) {
      return this.currentShift.execute(req.user.branchId);
    }
    if (!branchId) {
      throw new BadRequestException('Vui lòng chọn chi nhánh để xem ca hiện tại');
    }
    return this.currentShift.execute(branchId);
  }

  @Post('open')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  open(@Request() req: any, @Body() dto: OpenShiftDto) {
    dto.branchId = this.resolveBranchId(req.user, dto.branchId);
    return this.openShift.execute(dto, req.user.id);
  }

  @Post(':id/close')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  close(@Request() req: any, @Param('id') id: string, @Body() dto: CloseShiftDto) {
    // STAFF: khóa về chi nhánh mình. GĐ/KTTH: shiftId đã xác định chi nhánh, branchId optional.
    if (req.user.role === UserRole.STAFF) {
      dto.branchId = req.user.branchId;
    }
    return this.closeShift.execute(id, dto, req.user.id);
  }

  // STAFF: khóa về chi nhánh của mình. GĐ/KTTH: dùng branchId chỉ định (BranchAccessGuard đã cho phép global role).
  private resolveBranchId(user: any, bodyBranchId?: string): string {
    if (user.role === UserRole.STAFF) {
      if (!user.branchId) {
        throw new BadRequestException('Nhân viên chưa được gán chi nhánh');
      }
      return user.branchId;
    }
    if (!bodyBranchId) {
      throw new BadRequestException('GĐ/KTTH vui lòng chọn chi nhánh để mở ca');
    }
    return bodyBranchId;
  }
}
