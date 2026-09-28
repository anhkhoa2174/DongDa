import 'reflect-metadata';
import { validate } from 'class-validator';
import { ApprovePendingDebtDto, ListDebtsQueryDto } from './debt.dto';

function dto(reason: unknown) {
  return Object.assign(new ApprovePendingDebtDto(), { reason });
}

describe('ApprovePendingDebtDto', () => {
  it('chấp nhận lý do hợp lệ', async () => {
    await expect(validate(dto('Journal WU thiếu dòng, đã xác nhận với WU'))).resolves.toHaveLength(0);
  });

  it('chấp nhận lý do đúng 500 ký tự', async () => {
    await expect(validate(dto('a'.repeat(500)))).resolves.toHaveLength(0);
  });

  it.each([
    ['thiếu lý do', undefined],
    ['lý do rỗng', ''],
    ['lý do không phải chuỗi', 123],
    ['lý do dài hơn 500 ký tự', 'a'.repeat(501)],
  ])('từ chối khi %s', async (_label, reason) => {
    const errors = await validate(dto(reason));
    expect(errors.some((error) => error.property === 'reason')).toBe(true);
  });
});

describe('ListDebtsQueryDto', () => {
  it('chấp nhận đầy đủ bộ lọc công nợ', async () => {
    const query = Object.assign(new ListDebtsQueryDto(), {
      branchId: '11111111-1111-4111-8111-111111111111',
      bankAccountId: '22222222-2222-4222-8222-222222222222',
      providerCode: 'WU',
      currencyCode: 'USD',
      status: 'RECONCILED',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
    });

    await expect(validate(query)).resolves.toHaveLength(0);
  });

  it.each([
    ['ngân hàng không phải UUID', { bankAccountId: 'MSB' }],
    ['provider ngoài WU/MG', { providerCode: 'RIA' }],
    ['trạng thái không hợp lệ', { status: 'OPEN' }],
    ['ngày không hợp lệ', { dateFrom: '28/09/2026' }],
  ])('từ chối khi %s', async (_label, values) => {
    const errors = await validate(Object.assign(new ListDebtsQueryDto(), values));
    expect(errors).not.toHaveLength(0);
  });
});
