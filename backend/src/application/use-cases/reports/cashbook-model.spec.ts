import { buildCashBookModel, normalizeCashBookColumns, CASHBOOK_DEFAULT_COLUMNS } from './cashbook-model';
import type { CashBook } from '../../../domain/repositories/reports.repository';

const book: CashBook = {
  branch: { id: 'b1', code: 'NCT', name: 'Chi nhánh Nguyễn Cư Trinh', address: '191 Nguyễn Cư Trinh' },
  dateFrom: '2026-01-01',
  dateTo: '2026-01-02',
  days: [
    {
      date: '2026-01-01', openingUsd: 86818.02, openingVnd: 300000000,
      rows: [
        { time: new Date('2026-01-01T02:00:00Z'), kind: 'FUND_IN', code: 'FT-1', name: 'Nhận tiếp quỹ từ Hội sở', description: '', inUsd: 0, inVnd: 50000000, outUsd: 0, outVnd: 0, balanceUsd: 86818.02, balanceVnd: 350000000 },
        { time: new Date('2026-01-01T03:00:00Z'), kind: 'WU', code: '0273631579', name: 'NGUYEN THI HANG', description: '', inUsd: 0, inVnd: 0, outUsd: 382.43, outVnd: 0, balanceUsd: 86435.59, balanceVnd: 350000000 },
      ],
      totalInUsd: 0, totalInVnd: 50000000, totalOutUsd: 382.43, totalOutVnd: 0, closingUsd: 86435.59, closingVnd: 350000000,
    },
    { date: '2026-01-02', openingUsd: 86435.59, openingVnd: 350000000, rows: [], totalInUsd: 0, totalInVnd: 0, totalOutUsd: 0, totalOutVnd: 0, closingUsd: 86435.59, closingVnd: 350000000 },
  ],
};

describe('buildCashBookModel — sổ thu chi hằng ngày theo mẫu Excel', () => {
  it('mỗi ngày có phát sinh 1 sheet ddMMyy, có tồn đầu, dòng giao dịch (MTCN có gạch), tổng cộng, tồn cuối', () => {
    const model = buildCashBookModel(book, CASHBOOK_DEFAULT_COLUMNS, '2026-08-15T00:00:00Z');
    expect(model.sheets.map((s) => s.name)).toEqual(['Tổng hợp', '010126']); // ngày 02 không phát sinh -> chỉ ở Tổng hợp
    const sheet = model.sheets[1].aoa;
    expect(sheet[2]).toEqual(['STT', 'Ngày', 'Loại', 'MTCN / Mã', 'Họ & tên người nhận / Nguồn tiền', 'Nhận', 'Nhận', 'Chi', 'Chi', 'Tồn', 'Tồn']);
    expect(sheet[3]).toEqual(['', '', '', '', '', 'USD', 'VND', 'USD', 'VND', 'USD', 'VND']);
    expect(sheet[4][4]).toBe('Tồn đầu kỳ');
    expect(sheet[4].slice(9)).toEqual([86818.02, 300000000]);
    expect(sheet[6]).toEqual([2, '01/01/2026', 'WU', '027-363-1579', 'NGUYEN THI HANG', '', '', 382.43, '', 86435.59, 350000000]);
    expect(sheet[7][4]).toBe('Tổng cộng');
    expect(sheet[8][4]).toBe('Tồn cuối kỳ');
    expect(model.sheets[0].aoa[7]).toEqual(['02/01/2026', 86435.59, 350000000, 0, 0, 0, 0, 86435.59, 350000000, 0]);
  });

  it('chọn cột: chỉ giữ cột hợp lệ theo thứ tự chuẩn; rỗng -> mặc định', () => {
    expect(normalizeCashBookColumns(['name', 'code', 'bogus', 'balanceVnd'])).toEqual(['code', 'name', 'balanceVnd']);
    expect(normalizeCashBookColumns([])).toEqual(CASHBOOK_DEFAULT_COLUMNS);
    const model = buildCashBookModel(book, ['code', 'name', 'outUsd'], 'x');
    expect(model.sheets[1].aoa[2]).toEqual(['MTCN / Mã', 'Họ & tên người nhận / Nguồn tiền', 'Chi']);
    expect(model.sheets[1].aoa[6]).toEqual(['027-363-1579', 'NGUYEN THI HANG', 382.43]);
  });
});
