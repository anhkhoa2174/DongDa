// Branch Controller — reference data (mọi vai trò đăng nhập đọc được)
// Layer: Interface (HTTP)

import {
  Body, Controller, Get, Param, Patch, Post, UseGuards, Inject,
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { IBranchRepository } from '../../../domain/repositories/branch.repository';
import { CreateBranchDto } from '../../../application/dtos/branch/branch.dto';

@Controller('branches')
@UseGuards(JwtAuthGuard)
export class BranchController {
  constructor(
    @Inject('IBranchRepository') private readonly branchRepo: IBranchRepository,
  ) {}

  @Get()
  list() {
    return this.branchRepo.list();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateBranchDto) {
    return this.branchRepo.create(dto);
  }

  // Không xóa — vô hiệu hóa (ẩn khỏi list(), giữ nguyên dữ liệu/lịch sử tham chiếu).
  @Patch(':id/deactivate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  deactivate(@Param('id') id: string) {
    return this.branchRepo.deactivate(id);
  }
}
