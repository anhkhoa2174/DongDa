import { buildWuPayoutReportModel, buildProviderLedgerModel } from './provider-ledger-model';
import type { CashBook } from '../../../domain/repositories/reports.repository';

const book: CashBook = {
  branch: { id: 'b1', code: 'NCT', name: 'Chi nhánh Nguyễn Cư Trinh', address: '191 Nguyễn Cư Trinh' },
  dateFrom: '2026-01-01', dateTo: '2026-01-02',
  days: [
    {
      date: '2026-01-01', openingUsd: 86818.02, openingVnd: 300000000,
      rows: [
        { time: new Date(), kind: 'FUND_IN', code: 'FT-1', name: 'Nhận tiếp quỹ từ Hội sở', description: '', inUsd: 0, inVnd: 50000000, outUsd: 0, outVnd: 0, balanceUsd: 86818.02, balanceVnd: 350000000 },
        { time: new Date(), kind: 'WU', code: '0273631579', name: 'NGUYEN THI HANG', description: '', inUsd: 0, inVnd: 0, outUsd: 382.43, outVnd: 0, balanceUsd: 86435.59, balanceVnd: 350000000 },
        { time: new Date(), kind: 'WU', code: '4569206341', name: 'THANH LUAN NGO', description: '', inUsd: 0, inVnd: 0, outUsd: 0, outVnd: 15126000, balanceUsd: 86435.59, balanceVnd: 334874000 },
        { time: new Date(), kind: 'MG', code: '47161829', name: 'DONG PHAM', description: '', inUsd: 0, inVnd: 0, outUsd: 100, outVnd: 0, balanceUsd: 86335.59, balanceVnd: 334874000 },
      ],
      totalInUsd: 0, totalInVnd: 50000000, totalOutUsd: 482.43, totalOutVnd: 15126000, closingUsd: 86335.59, closingVnd: 334874000,
    },
    { date: '2026-01-02', openingUsd: 86335.59, openingVnd: 334874000, rows: [], totalInUsd: 0, totalInVnd: 0, totalOutUsd: 0, totalOutVnd: 0, closingUsd: 86335.59, closingVnd: 334874000 },
  ],
};

describe('#2 Báo cáo theo dõi chi trả Western Union (mẫu Official sổ thu chi hằng ngày)', () => {
  it('mỗi ngày 1 sheet ddMM: tồn đầu, nhận về, dòng WU (MTCN có gạch), chi khác, TOTAL khớp tồn cuối', () => {
    const m = buildWuPayoutReportModel(book, 'x');
    expect(m.sheets.map((s) => s.name)).toEqual(['Tổng hợp', '0101']);
    const a = m.sheets[1].aoa;
    expect(a[2]).toEqual(['STT', 'Ngày', 'MTCN', 'Họ & tên người nhận', 'Nhận từ Ngân hàng', '', 'Chi', '', 'Tồn', '']);
    expect(a[4].slice(3)).toEqual(['Tồn đầu kỳ', '', '', '', '', 86818.02, 300000000]);
    expect(a[5].slice(3, 6)).toEqual(['Nhận về từ Ngân hàng / tiếp quỹ', '', 50000000]);
    expect(a[6]).toEqual([1, '01/01/2026', '027-363-1579', 'NGUYEN THI HANG', '', '', 382.43, '', '', '']);
    expect(a[7]).toEqual([2, '01/01/2026', '456-920-6341', 'THANH LUAN NGO', '', '', '', 15126000, '', '']);
    expect(a[8][3]).toBe('Chi khác (MG)');
    expect(a[8][6]).toBe(100);
    expect(a[9]).toEqual(['', '', '', 'TOTAL', 0, 50000000, 482.43, 15126000, 86335.59, 334874000]);
    expect(a[11][6]).toBe('Giám đốc Chi nhánh');
  });
});

describe('#3/#4 Sổ quỹ thu chi WU/MG theo loại tiền (mẫu Sổ theo dõi thu chi quỹ USD)', () => {
  it('mỗi tháng 1 sheet, chỉ dòng chạm loại tiền, tồn chạy dần, đầu kỳ / cuối tháng', () => {
    const m = buildProviderLedgerModel(book, 'WU', 'USD', 'x');
    expect(m.sheets.map((s) => s.name)).toEqual(['Tổng hợp', 'Tháng 01-2026']);
    const a = m.sheets[1].aoa;
    expect(a[1][0]).toContain('SỔ QUỸ THEO DÕI THU CHI WESTERN UNION');
    expect(a[3]).toEqual(['', '', '', 'THU (USD)', 'CHI (USD)', 'TỒN (USD)']);
    expect(a[4]).toEqual(['01/01/2026', 'SỐ TỒN ĐẦU KỲ TẠI QUỸ', '', '', '', 86818.02]);
    // dòng VND (WU trả VND, tiếp quỹ VND) không xuất hiện trong sổ USD
    expect(a[5]).toEqual(['01/01/2026', '027-363-1579', 'NGUYEN THI HANG', '', 382.43, 86435.59]);
    expect(a[6]).toEqual(['01/01/2026', '47161829', 'MG - DONG PHAM', '', 100, 86335.59]);
    expect(a[7]).toEqual(['TỔNG PHÁT SINH', '', '', 0, 482.43, '']);
    expect(a[8]).toEqual(['SỐ TỒN CUỐI THÁNG', '', '', '', '', 86335.59]);
  });
  it('MG + VND', () => {
    const a = buildProviderLedgerModel(book, 'MG', 'VND', 'x').sheets[1].aoa;
    expect(a[1][0]).toContain('MONEYGRAM');
    expect(a[5]).toEqual(['01/01/2026', 'FT-1', 'Tiếp quỹ nhận - Nhận tiếp quỹ từ Hội sở', 50000000, '', 350000000]);
    expect(a[6][2]).toBe('WU - THANH LUAN NGO');
  });
});
