import { Body, Controller, Get, Headers, Post, Query, Request, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  CreateDomesticTransferUseCase,
  ListDomesticTransferBankAccountsUseCase,
  ListDomesticTransferUseCase,
} from '../../../application/use-cases/domestic-transfer/domestic-transfer.use-cases';
import { ExportDomesticTransferFormUseCase } from '../../../application/use-cases/domestic-transfer/export-domestic-transfer-form.use-case';
import { CreateDomesticTransferDto, ListDomesticTransferQueryDto } from '../../../application/dtos/domestic-transfer/domestic-transfer.dto';
import { UserRole } from '../../../domain/entities/user.entity';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { BranchAccessGuard } from '../guards/branch-access.guard';
import { Roles, RolesGuard } from '../guards/roles.guard';
import { requireIdempotencyKey } from '../idempotency-key';

@Controller('domestic-transfers')
@UseGuards(JwtAuthGuard, BranchAccessGuard)
export class DomesticTransferController {
  constructor(
    private readonly createTransfer: CreateDomesticTransferUseCase,
    private readonly listTransfers: ListDomesticTransferUseCase,
    private readonly listBankAccounts: ListDomesticTransferBankAccountsUseCase,
    private readonly exportTransferForm: ExportDomesticTransferFormUseCase,
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
  create(
    @Request() req: any,
    @Body() dto: CreateDomesticTransferDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (req.user?.role === UserRole.STAFF) dto.branchId = req.user.branchId;
    return this.createTransfer.execute(dto, req.user.id, requireIdempotencyKey(idempotencyKey));
  }

  @Post('form')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  async exportForm(
    @Request() req: any,
    @Body() dto: CreateDomesticTransferDto,
    @Res() response: Response,
  ) {
    if (req.user?.role === UserRole.STAFF) dto.branchId = req.user.branchId;
    const result = await this.exportTransferForm.execute(dto);
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    response.send(result.buffer);
  }
}
