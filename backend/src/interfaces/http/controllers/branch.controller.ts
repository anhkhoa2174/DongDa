// Branch Controller — reference data (mọi vai trò đăng nhập đọc được)
// Layer: Interface (HTTP)

import { Controller, Get, UseGuards, Inject } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { IBranchRepository } from '../../../domain/repositories/branch.repository';

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
}
