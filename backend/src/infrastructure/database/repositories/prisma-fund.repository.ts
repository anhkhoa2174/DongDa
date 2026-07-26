// Prisma Fund Repository — số dư quỹ (từ ledger) + điều chuyển vốn
// Layer: Infrastructure

import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  IFundRepository, CreateTransferInput, ListTransfersFilter,
} from '../../../domain/repositories/fund.repository';
import {
  FundTransfer, FundTransferStatus, FundAccountBalance, CurrencyCode,
} from '../../../domain/entities/fund.entity';

@Injectable()
export class PrismaFundRepository implements IFundRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listBalances(branchId?: string): Promise<FundAccountBalance[]> {
    const accounts = await this.prisma.fund_accounts.findMany({
      where: { status: 'ACTIVE', ...(branchId && { branch_id: branchId }) },
      orderBy: [{ branch_id: 'asc' }, { code: 'asc' }],
    });
    const ids = accounts.map((a) => a.id);
    const balByAcc = await this.balancesFor(ids);
    return accounts.map((a) => ({
      id: a.id,
      branchId: a.branch_id,
      code: a.code,
      name: a.name,
      accountType: a.account_type,
      currencyCode: a.currency_code as CurrencyCode,
      balance: balByAcc.get(a.id) ?? 0,
    }));
  }

  async getBalance(fundAccountId: string): Promise<number> {
    const m = await this.balancesFor([fundAccountId]);
    return m.get(fundAccountId) ?? 0;
  }

  async findCashAccount(branchId: string, currency: CurrencyCode) {
    const acc = await this.prisma.fund_accounts.findFirst({
      where: { branch_id: branchId, account_type: 'CASH', currency_code: currency, status: 'ACTIVE' },
      select: { id: true },
    });
    return acc;
  }

  async createTransfer(input: CreateTransferInput): Promise<FundTransfer> {
    if (input.sourceBranchId === input.destinationBranchId) {
      throw new BadRequestException('Chi nhánh gửi và nhận phải khác nhau');
    }
    const source = await this.findCashAccount(input.sourceBranchId, input.currencyCode);
    const dest = await this.findCashAccount(input.destinationBranchId, input.currencyCode);
    if (!source || !dest) {
      throw new BadRequestException(`Thiếu sổ quỹ tiền mặt ${input.currencyCode} ở chi nhánh gửi/nhận`);
    }
    // Kiểm tra số dư bên gửi
    const srcBal = await this.getBalance(source.id);
    if (input.amount > srcBal) {
      throw new BadRequestException(`Số dư không đủ (còn ${srcBal} ${input.currencyCode})`);
    }

    const row = await this.prisma.fund_transfers.create({
      data: {
        transfer_no: `FT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        source_branch_id: input.sourceBranchId,
        destination_branch_id: input.destinationBranchId,
        source_account_id: source.id,
        destination_account_id: dest.id,
        currency_code: input.currencyCode,
        amount: input.amount,
        status: 'PENDING_APPROVAL',
        created_by_user_id: input.createdByUserId,
      },
    });
    return toTransfer(row);
  }

  async findTransferById(id: string): Promise<FundTransfer | null> {
    const row = await this.prisma.fund_transfers.findUnique({ where: { id } });
    return row ? toTransfer(row) : null;
  }

  async listTransfers(filter?: ListTransfersFilter): Promise<FundTransfer[]> {
    const rows = await this.prisma.fund_transfers.findMany({
      where: {
        ...(filter?.status && { status: filter.status as any }),
        ...(filter?.branchId && {
          OR: [
            { source_branch_id: filter.branchId },
            { destination_branch_id: filter.branchId },
          ],
        }),
      },
      orderBy: { created_at: 'desc' },
    });
    return rows.map(toTransfer);
  }

  async confirmTransfer(id: string, confirmedByUserId: string): Promise<FundTransfer> {
    const t = await this.prisma.fund_transfers.findUniqueOrThrow({ where: { id } });
    if (t.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`Chỉ xác nhận được phiếu đang chờ (hiện tại: ${t.status})`);
    }
    const amount = Number(t.amount);
    const rate = t.currency_code === 'VND' ? 1 : 25_000; // TODO: dùng active rate
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      // Ghi sổ cái: CREDIT nguồn (giảm) + DEBIT đích (tăng)
      await tx.ledger_entries.create({
        data: {
          entry_no: `FT-${t.transfer_no}`,
          business_date: now,
          branch_id: t.source_branch_id,
          source_type: 'FUND_TRANSFER',
          source_id: t.id,
          status: 'POSTED',
          posted_at: now,
          description: `Điều chuyển ${amount} ${t.currency_code}`,
          created_by_user_id: confirmedByUserId,
          ledger_lines: {
            create: [
              {
                fund_account_id: t.source_account_id,
                direction: 'CREDIT',
                amount,
                currency_code: t.currency_code,
                exchange_rate: rate,
                base_amount_vnd: amount * rate,
              },
              {
                fund_account_id: t.destination_account_id,
                direction: 'DEBIT',
                amount,
                currency_code: t.currency_code,
                exchange_rate: rate,
                base_amount_vnd: amount * rate,
              },
            ],
          },
        },
      });
      return tx.fund_transfers.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          confirmed_by_user_id: confirmedByUserId,
          confirmed_at: now,
          posted_at: now,
        },
      });
    });
    return toTransfer(updated);
  }

  async rejectTransfer(id: string, userId: string): Promise<FundTransfer> {
    const t = await this.prisma.fund_transfers.findUniqueOrThrow({ where: { id } });
    if (t.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`Chỉ từ chối được phiếu đang chờ (hiện tại: ${t.status})`);
    }
    const row = await this.prisma.fund_transfers.update({
      where: { id },
      data: { status: 'REJECTED', confirmed_by_user_id: userId, confirmed_at: new Date() },
    });
    return toTransfer(row);
  }

  // ── helper: tính số dư nhiều account từ ledger_lines POSTED ──
  private async balancesFor(accountIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (accountIds.length === 0) return map;
    const lines = await this.prisma.ledger_lines.findMany({
      where: { fund_account_id: { in: accountIds }, ledger_entries: { status: 'POSTED' } },
      select: { fund_account_id: true, direction: true, amount: true },
    });
    for (const l of lines) {
      const cur = map.get(l.fund_account_id) ?? 0;
      const amt = Number(l.amount);
      map.set(l.fund_account_id, cur + (l.direction === 'DEBIT' ? amt : -amt));
    }
    return map;
  }
}

function toTransfer(row: any): FundTransfer {
  return {
    id: row.id,
    transferNo: row.transfer_no,
    sourceBranchId: row.source_branch_id,
    destinationBranchId: row.destination_branch_id,
    sourceAccountId: row.source_account_id,
    destinationAccountId: row.destination_account_id,
    currencyCode: row.currency_code as CurrencyCode,
    amount: Number(row.amount),
    status: row.status as FundTransferStatus,
    createdByUserId: row.created_by_user_id,
    confirmedByUserId: row.confirmed_by_user_id ?? null,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at ?? null,
  };
}
