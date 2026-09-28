import 'reflect-metadata';
import { validate } from 'class-validator';
import { ApprovePendingDebtDto } from './debt.dto';

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
