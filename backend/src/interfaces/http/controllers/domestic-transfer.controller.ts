import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import {
  CreateDomesticTransferUseCase,
  ListDomesticTransferBankAccountsUseCase,
  ListDomesticTransferUseCase,
} from '../../../application/use-cases/domestic-transfer/domestic-transfer.use-cases';
import { CreateDomesticTransferDto, ListDomesticTransferQueryDto } from '../../../application/dtos/domestic-transfer/domestic-transfer.dto';
import { UserRole } from '../../../domain/entities/user.entity';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { BranchAccessGuard } from '../guards/branch-access.guard';
import { Roles, RolesGuard } from '../guards/roles.guard';

@Controller('domestic-transfers')
@UseGuards(JwtAuthGuard, BranchAccessGuard)
export class DomesticTransferController {
  constructor(
    private readonly createTransfer: CreateDomesticTransferUseCase,
    private readonly listTransfers: ListDomesticTransferUseCase,
    private readonly listBankAccounts: ListDomesticTransferBankAccountsUseCase,
  ) {}

  @Get('bank-accounts')
  bankAccounts() {
    return this.listBankAccounts.execute();
  }

  @Get()
  list(@Request() req: any, @Query() query: ListDomesticTransferQueryDto) {
    if (req.user?.role === UserRole.STAFF) query.branchId = req.user.branchId;
    return this.listTransfers.execute(query);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  create(@Request() req: any, @Body() dto: CreateDomesticTransferDto) {
    if (req.user?.role === UserRole.STAFF) dto.branchId = req.user.branchId;
    return this.createTransfer.execute(dto, req.user.id);
  }
}
