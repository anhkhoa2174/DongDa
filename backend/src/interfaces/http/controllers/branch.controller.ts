// Branch Controller — reference data (mọi vai trò đăng nhập đọc được)
// Layer: Interface (HTTP)

import { Body, Controller, Get, Post, UseGuards, Inject } from '@nestjs/common';
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
}
