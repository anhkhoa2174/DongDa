// Prisma WU Repository — tạo GD Western Union (atomic: ca + quỹ + công nợ)
// Layer: Infrastructure

import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { IWuRepository, CreateWuInput, ListWuFilter } from '../../../domain/repositories/wu.repository';
import { WuTransaction, Currency2, wuImpliedRate } from '../../../domain/entities/wu.entity';
import { toVietnamBusinessDate } from '../business-date';

@Injectable()
export class PrismaWuRepository implements IWuRepository {
  constructor(private readonly prisma: PrismaService) {}

  async mtcnExists(mtcn: string): Promise<boolean> {
    const count = await this.prisma.wu_transaction_details.count({
      where: { mtcn, customer_transactions: { status: 'COMPLETED' } },
    });
    return count > 0;
  }

  async create(input: CreateWuInput): Promise<WuTransaction> {
    const now = new Date();
    const businessDate = toVietnamBusinessDate(now);
    const rate = input.appliedRate;

    let txnId: string;
    try {
      txnId = await this.prisma.$transaction(async (tx) => {
        // 1. Bắt buộc có ca mở trước khi tạo giao dịch.
        const shift = await this.ensureShift(tx, input.branchId);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'WU:' + input.mtcn}))`;
        const duplicate = await tx.wu_transaction_details.count({
          where: { mtcn: input.mtcn, customer_transactions: { status: 'COMPLETED' } },
        });
        if (duplicate > 0) throw new ConflictException(`MSKH (MTCN) ${input.mtcn} đã được xử lý`);

        // 2. customer_transaction (WU, COMPLETED)
        const txn = await tx.customer_transactions.create({
          data: {
            transaction_no: `WU-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            operation_code: 'WU',
            branch_id: input.branchId,
            shift_id: shift.id,
            business_date: businessDate,
            status: 'COMPLETED',
            customer_name: input.customerName ?? null,
            customer_phone: input.customerPhone,
            amount: input.wuUsdAmount,
            currency_code: 'USD',
            vnd_amount: input.wuVndAmount,
            created_by_user_id: input.createdByUserId,
          },
        });

        // 3. Chi tiết WU (snapshot tỷ giá)
        await tx.wu_transaction_details.create({
          data: {
            transaction_id: txn.id,
            mtcn: input.mtcn,
            sending_country: input.sendingCountry,
            sender_state: input.senderState ?? null,
            receiver_date_of_birth: input.receiverDateOfBirth,
            current_address: input.currentAddress,
            identity_address: input.identityAddress ?? null,
            identity_document_type: input.identityDocumentType,
            identity_document_number: input.identityDocumentNumber,
            identity_issuing_country: input.identityIssuingCountry,
            identity_issue_date: input.identityIssueDate,
            identity_expiry_date: input.identityExpiryDate,
            has_visa: input.hasVisa,
            visa_type: input.visaType ?? null,
            visa_number: input.visaNumber ?? null,
            visa_issue_date: input.visaIssueDate ?? null,
            visa_expiry_date: input.visaExpiryDate ?? null,
            employment_status: input.employmentStatus,
            country_of_birth: input.countryOfBirth,
            sender_relationship: input.senderRelationship,
            receive_purpose: input.receivePurpose,
            sender_name: input.senderName,
            received_date: input.receivedDate,
            paid_currency: input.paidCurrency,
            payout_currency: input.payoutCurrency,
            wu_usd_amount: input.wuUsdAmount,
            wu_vnd_amount: input.wuVndAmount,
            received_usd: input.receivedUsd,
            received_vnd: input.receivedVnd,
            wu_rate: wuImpliedRate(input.wuVndAmount, input.wuUsdAmount),
            system_rate: input.systemRate,
            applied_rate: rate,
          },
        });

        // 4. Ledger: trả khách → quỹ tiền mặt GIẢM (CREDIT)
        const lines: any[] = [];
        if (input.receivedVnd > 0) {
          const acc = await this.cashAccount(tx, input.branchId, 'VND');
          await this.ensureEnoughBalance(tx, acc, input.receivedVnd, 'VND');
          lines.push({ fund_account_id: acc, direction: 'CREDIT', amount: input.receivedVnd,
            currency_code: 'VND', exchange_rate: 1, base_amount_vnd: input.receivedVnd });
        }
        if (input.receivedUsd > 0) {
          const acc = await this.cashAccount(tx, input.branchId, 'USD');
          await this.ensureEnoughBalance(tx, acc, input.receivedUsd, 'USD');
          lines.push({ fund_account_id: acc, direction: 'CREDIT', amount: input.receivedUsd,
            currency_code: 'USD', exchange_rate: rate, base_amount_vnd: input.receivedUsd * rate });
        }
        if (lines.length === 0) throw new BadRequestException('Phải trả khách ít nhất 1 loại tiền (USD hoặc VND)');

        await tx.ledger_entries.create({
          data: {
            entry_no: `WU-${txn.transaction_no}`,
            business_date: businessDate,
            branch_id: input.branchId,
            shift_id: shift.id,
            source_type: 'CUSTOMER_TRANSACTION',
            source_id: txn.id,
            status: 'POSTED',
            posted_at: now,
            description: `WU chi trả MSKH ${input.mtcn}`,
            created_by_user_id: input.createdByUserId,
            ledger_lines: { create: lines },
          },
        });

        // 5. Công nợ WU tăng (Paid Currency)
        const debtAmount = input.paidCurrency === 'USD' ? input.wuUsdAmount : input.wuVndAmount;
        const debtAcc = await this.ensureDebtAccount(tx, input.branchId, 'WU', input.paidCurrency, businessDate);
        await tx.debt_movements.create({
          data: {
            debt_account_id: debtAcc,
            branch_id: input.branchId,
            movement_type: 'EXPECTED_DEBT',
            source_type: 'CUSTOMER_TRANSACTION',
            source_id: txn.id,
            business_date: businessDate,
            amount: debtAmount,
            currency_code: input.paidCurrency,
            status: 'POSTED',
            posted_at: now,
            description: `Công nợ WU MSKH ${input.mtcn}`,
            created_by_user_id: input.createdByUserId,
          },
        });

        return txn.id;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = error.meta?.target;
        const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
        if (fields.some((field) => field.includes('mtcn') || field.includes('uq_wu_mtcn'))) {
          throw new ConflictException(`MSKH (MTCN) ${input.mtcn} đã được xử lý`);
        }
      }
      throw error;
    }

    return (await this.findById(txnId))!;
  }

  async findById(id: string): Promise<WuTransaction | null> {
    const row = await this.prisma.customer_transactions.findUnique({
      where: { id },
      include: { wu_transaction_details: true, shifts: { select: { shift_code: true } } },
    });
    return row?.wu_transaction_details ? toDomain(row) : null;
  }

  async list(filter?: ListWuFilter): Promise<WuTransaction[]> {
    const rows = await this.prisma.customer_transactions.findMany({
      where: { operation_code: 'WU', ...(filter?.branchId && { branch_id: filter.branchId }) },
      include: { wu_transaction_details: true, shifts: { select: { shift_code: true } } },
      orderBy: { created_at: 'desc' },
    });
    return rows.filter((r) => r.wu_transaction_details).map(toDomain);
  }

  // ── helpers (dùng trong transaction) ──────────────────────

  private async ensureShift(tx: any, branchId: string) {
    await tx.$queryRaw`SELECT id FROM shifts WHERE branch_id = ${branchId}::uuid AND status = 'OPEN' FOR SHARE`;
    const open = await tx.shifts.findFirst({
      where: { branch_id: branchId, status: 'OPEN' },
    });
    if (open) return open;
    throw new BadRequestException('Chi nhánh chưa mở ca. Vui lòng mở ca và kiểm quỹ đầu ca trước khi tạo giao dịch WU.');
  }

  private async cashAccount(tx: any, branchId: string, currency: Currency2): Promise<string> {
    const acc = await tx.fund_accounts.findFirst({
      where: { branch_id: branchId, account_type: 'CASH', currency_code: currency, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!acc) throw new BadRequestException(`Chi nhánh chưa có sổ quỹ tiền mặt ${currency}`);
    return acc.id;
  }

  private async ensureEnoughBalance(tx: any, fundAccountId: string, amount: number, currency: Currency2) {
    await this.lockFundAccount(tx, fundAccountId);
    const balance = await this.balance(tx, fundAccountId);
    if (amount > balance) {
      throw new BadRequestException(`Không đủ tiền mặt ${currency}. Tồn hiện tại ${balance}, cần chi ${amount}`);
    }
  }

  private async lockFundAccount(tx: any, fundAccountId: string) {
    await tx.$queryRaw`SELECT id FROM fund_accounts WHERE id = ${fundAccountId}::uuid FOR UPDATE`;
  }

  private async balance(tx: any, fundAccountId: string): Promise<number> {
    const lines = await tx.ledger_lines.findMany({
      where: { fund_account_id: fundAccountId, ledger_entries: { status: 'POSTED' } },
      select: { direction: true, amount: true },
    });
    return lines.reduce((sum: number, line: any) => sum + (line.direction === 'DEBIT' ? Number(line.amount) : -Number(line.amount)), 0);
  }

  private async ensureDebtAccount(
    tx: any, branchId: string, provider: string, currency: Currency2, businessDate: Date,
  ): Promise<string> {
    const account = await tx.debt_accounts.upsert({
      where: {
        branch_id_provider_code_currency_code_business_date: {
          branch_id: branchId, provider_code: provider, currency_code: currency, business_date: businessDate,
        },
      },
      update: {},
      create: {
        branch_id: branchId,
        provider_code: provider,
        currency_code: currency,
        business_date: businessDate,
        name: `Công nợ ${provider} ${currency} ngày ${businessDate.toISOString().slice(0, 10)}`,
      },
    });
    return account.id;
  }
}

function toDomain(row: any): WuTransaction {
  const d = row.wu_transaction_details;
  const wuUsd = Number(d.wu_usd_amount);
  const wuRate = Number(d.wu_rate);
  const applied = Number(d.applied_rate);
  return {
    id: row.id,
    transactionNo: row.transaction_no,
    branchId: row.branch_id,
    shiftId: row.shift_id,
    businessDate: row.business_date,
    status: row.status,
    customerName: row.customer_name ?? null,
    customerPhone: row.customer_phone ?? null,
    sendingCountry: d.sending_country,
    senderState: d.sender_state ?? null,
    receiverDateOfBirth: d.receiver_date_of_birth,
    currentAddress: d.current_address,
    identityAddress: d.identity_address ?? null,
    identityDocumentType: d.identity_document_type,
    identityDocumentNumber: d.identity_document_number,
    identityIssuingCountry: d.identity_issuing_country,
    identityIssueDate: d.identity_issue_date,
    identityExpiryDate: d.identity_expiry_date,
    hasVisa: d.has_visa,
    visaType: d.visa_type,
    visaNumber: d.visa_number,
    visaIssueDate: d.visa_issue_date,
    visaExpiryDate: d.visa_expiry_date,
    employmentStatus: d.employment_status,
    countryOfBirth: d.country_of_birth,
    senderRelationship: d.sender_relationship,
    receivePurpose: d.receive_purpose,
    senderName: d.sender_name,
    receivedDate: d.received_date,
    shiftCode: row.shifts?.shift_code,
    mtcn: d.mtcn,
    wuUsdAmount: wuUsd,
    wuVndAmount: Number(d.wu_vnd_amount),
    receivedUsd: Number(d.received_usd),
    receivedVnd: Number(d.received_vnd),
    wuRate,
    systemRate: Number(d.system_rate),
    appliedRate: applied,
    paidCurrency: d.paid_currency,
    payoutCurrency: d.payout_currency,
    transactionValueVnd: Number(d.received_usd) * applied + Number(d.received_vnd),
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}
