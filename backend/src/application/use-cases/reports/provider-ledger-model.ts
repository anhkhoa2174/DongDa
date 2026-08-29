// Báo cáo #2/#3/#4 theo mẫu Excel anh Kiển gửi (docs/business):
//   #2 "Báo cáo theo dõi chi trả Western Union"  — mẫu "Official sổ theo dõi thu chi hằng ngày": mỗi NGÀY 1 sheet,
//      cột STT | Ngày | MTCN | Họ & tên người nhận | Nhận (USD, VND) | Chi (USD, VND) | Tồn (USD, VND),
//      dòng Tồn đầu kỳ, dòng Nhận về từ Ngân hàng/tiếp quỹ, TOTAL, chữ ký Giám đốc Chi nhánh.
//   #3 "Báo cáo theo dõi thu chi USD"            — mẫu "Sổ theo dõi thu chi quỹ USD": mỗi THÁNG 1 sheet, 1 loại tiền,
//      cột NGÀY | MTCN / Số GD | Tên KH / Nội dung | THU | CHI | TỒN chạy dần, SỐ TỒN ĐẦU KỲ / SỐ TỒN CUỐI THÁNG.
//   #4 "Báo cáo theo dõi thu chi MoneyGram"      — như #3 nhưng provider MG (mã = Reference).
// Nguồn số liệu: CashBook (dailyCashBook) — mọi bút toán chạm sổ tiền mặt của chi nhánh, tồn chạy dần từ ledger.
// Sổ mẫu của chi nhánh chỉ có WU nên tồn = đầu + nhận − chi WU; hệ thống còn MG/FX/phiếu chi nên các khoản đó
// được gom thành dòng "Chi khác" (#2) hoặc hiện thành dòng CHI có nội dung (#3/#4) để TỒN luôn khớp ledger.
// Layer: Application (thuần) — dùng cho preview, Excel và PDF.

import type { CashBook, CashBookDay, CashBookRow } from '../../../domain/repositories/reports.repository';
import type { ReportModel, ReportSheet } from './report-model';
import { CASHBOOK_KIND_LABEL } from './cashbook-model';

export type LedgerProvider = 'WU' | 'MG';
export type LedgerCurrency = 'USD' | 'VND';

const COMPANY = 'Công ty TNHH TM DV PT Đống Đa';

const PROVIDER_LABEL: Record<LedgerProvider, string> = { WU: 'WESTERN UNION', MG: 'MONEYGRAM' };
const CODE_LABEL: Record<LedgerProvider, string> = { WU: 'MTCN', MG: 'Reference' };

function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// MTCN 10 số hiển thị 027-363-1579 như sổ mẫu; Reference MG giữ nguyên.
function displayCode(row: CashBookRow): string {
  if (row.kind === 'WU' && /^\d{10}$/.test(row.code)) return `${row.code.slice(0, 3)}-${row.code.slice(3, 6)}-${row.code.slice(6)}`;
  return row.code;
}

const cell = (n: number) => (n ? n : '');
const round2 = (n: number) => Math.round(n * 100) / 100;

function headerLines(book: CashBook): string {
  return `${COMPANY}\n${book.branch.name}${book.branch.address ? `\n${book.branch.address}` : ''}`;
}

// ---------------------------------------------------------------------------
// #2 Báo cáo theo dõi chi trả Western Union — mỗi ngày 1 sheet ddMM
// ---------------------------------------------------------------------------
export function buildWuPayoutReportModel(book: CashBook, generatedAt: string): ReportModel {
  const title = `Báo cáo theo dõi chi trả Western Union — ${book.branch.code} ${book.branch.name}`;
  const W = 10;
  const pad = (arr: (string | number)[]) => [...arr, ...Array(Math.max(0, W - arr.length)).fill('')];

  const daySheet = (day: CashBookDay): ReportSheet => {
    const aoa: (string | number)[][] = [];
    aoa.push(pad([headerLines(book)]));
    aoa.push(pad([`BÁO CÁO THEO DÕI CHI TRẢ WESTERN UNION — ${ddmmyyyy(day.date)}`]));
    aoa.push(['STT', 'Ngày', 'MTCN', 'Họ & tên người nhận', 'Nhận từ Ngân hàng', '', 'Chi', '', 'Tồn', '']);
    aoa.push(['', '', '', '', 'USD', 'VND', 'USD', 'VND', 'USD', 'VND']);
    aoa.push(['', '', '', 'Tồn đầu kỳ', '', '', '', '', day.openingUsd, day.openingVnd]);
    // Sổ mẫu gom mọi khoản nhận về trong ngày thành 1 dòng "Nhận về từ Ngân hàng ACB"
    aoa.push(['', '', '', 'Nhận về từ Ngân hàng / tiếp quỹ', cell(day.totalInUsd), cell(day.totalInVnd), '', '', '', '']);

    const wuRows = day.rows.filter((r) => r.kind === 'WU');
    let chiUsd = 0;
    let chiVnd = 0;
    wuRows.forEach((r, i) => {
      chiUsd += r.outUsd;
      chiVnd += r.outVnd;
      aoa.push([i + 1, ddmmyyyy(day.date), displayCode(r), r.name, '', '', cell(r.outUsd), cell(r.outVnd), '', '']);
    });
    // Khoản chi không phải WU (MG, ngoại tệ, phiếu chi, tiếp quỹ gửi đi...) — chỉ hiện khi có, để tồn khớp ledger
    const otherUsd = round2(day.totalOutUsd - chiUsd);
    const otherVnd = round2(day.totalOutVnd - chiVnd);
    if (otherUsd || otherVnd) {
      const kinds = [...new Set(day.rows.filter((r) => r.kind !== 'WU' && (r.outUsd || r.outVnd)).map((r) => CASHBOOK_KIND_LABEL[r.kind] ?? r.kind))];
      aoa.push(['', '', '', `Chi khác (${kinds.join(', ')})`, '', '', cell(otherUsd), cell(otherVnd), '', '']);
    }
    aoa.push(['', '', '', 'TOTAL', day.totalInUsd, day.totalInVnd, day.totalOutUsd, day.totalOutVnd, day.closingUsd, day.closingVnd]);
    aoa.push(pad([]));
    aoa.push(['', '', '', '', '', '', 'Giám đốc Chi nhánh', '', '', '']);
    aoa.push(['', '', '', '', '', '', '(Ký tên & đóng dấu)', '', '', '']);

    const [, m, d] = day.date.split('-');
    return { name: `${d}${m}`, aoa };
  };

  const summary: ReportSheet = {
    name: 'Tổng hợp',
    aoa: [
      ['Báo cáo', 'Báo cáo theo dõi chi trả Western Union'],
      ['Chi nhánh', `${book.branch.code} - ${book.branch.name}`],
      ['Từ ngày', ddmmyyyy(book.dateFrom)],
      ['Đến ngày', ddmmyyyy(book.dateTo)],
      ['Thời điểm xuất', generatedAt],
      [],
      ['Ngày', 'Số GD WU', 'Chi WU USD', 'Chi WU VND', 'Nhận USD', 'Nhận VND', 'Tồn cuối USD', 'Tồn cuối VND'],
      ...book.days.map((d) => {
        const wu = d.rows.filter((r) => r.kind === 'WU');
        return [
          ddmmyyyy(d.date), wu.length,
          round2(wu.reduce((s, r) => s + r.outUsd, 0)), round2(wu.reduce((s, r) => s + r.outVnd, 0)),
          d.totalInUsd, d.totalInVnd, d.closingUsd, d.closingVnd,
        ];
      }),
    ],
  };
  const daySheets = book.days.filter((d) => d.rows.length > 0).map(daySheet);
  return { title, sheets: [summary, ...daySheets] };
}

// ---------------------------------------------------------------------------
// #3/#4 Sổ quỹ theo dõi thu chi WU/MG theo 1 loại tiền — mỗi tháng 1 sheet
// ---------------------------------------------------------------------------
export function buildProviderLedgerModel(
  book: CashBook,
  provider: LedgerProvider,
  currency: LedgerCurrency,
  generatedAt: string,
): ReportModel {
  const providerName = provider === 'WU' ? 'Western Union' : 'MoneyGram';
  const title = provider === 'WU'
    ? `Báo cáo theo dõi thu chi ${currency} — ${book.branch.code} ${book.branch.name}`
    : `Báo cáo theo dõi thu chi MoneyGram (${currency}) — ${book.branch.code} ${book.branch.name}`;
  const pick = (r: CashBookRow) => currency === 'USD'
    ? { thu: r.inUsd, chi: r.outUsd, ton: r.balanceUsd }
    : { thu: r.inVnd, chi: r.outVnd, ton: r.balanceVnd };
  const opening = (d: CashBookDay) => (currency === 'USD' ? d.openingUsd : d.openingVnd);
  const closing = (d: CashBookDay) => (currency === 'USD' ? d.closingUsd : d.closingVnd);

  // Gom ngày theo tháng
  const months = new Map<string, CashBookDay[]>();
  for (const d of book.days) {
    const key = d.date.slice(0, 7);
    if (!months.has(key)) months.set(key, []);
    months.get(key)!.push(d);
  }

  const sheets: ReportSheet[] = [];
  for (const [ym, days] of months) {
    const [y, m] = ym.split('-');
    const aoa: (string | number)[][] = [];
    aoa.push([headerLines(book), '', '', '', '', '']);
    aoa.push([`SỔ QUỸ THEO DÕI THU CHI ${PROVIDER_LABEL[provider]}\nLoại quỹ: ${currency}`, '', '', '', '', '']);
    aoa.push(['NGÀY', `Mã số nhận tiền\n(${CODE_LABEL[provider]}) / Số GD`, 'Tên Khách hàng / Nội dung', `Số tiền (${currency})`, '', '']);
    aoa.push(['', '', '', `THU (${currency})`, `CHI (${currency})`, `TỒN (${currency})`]);
    aoa.push([ddmmyyyy(days[0].date), 'SỐ TỒN ĐẦU KỲ TẠI QUỸ', '', '', '', opening(days[0])]);

    let thuTotal = 0;
    let chiTotal = 0;
    let rowCount = 0;
    for (const day of days) {
      for (const r of day.rows) {
        const { thu, chi, ton } = pick(r);
        if (!thu && !chi) continue; // không chạm loại tiền này
        const isProvider = r.kind === provider;
        const code = isProvider ? displayCode(r) : r.code;
        const content = isProvider
          ? r.name
          : `${CASHBOOK_KIND_LABEL[r.kind] ?? r.kind}${r.name ? ` - ${r.name}` : ''}${r.description && r.description !== r.name ? ` (${r.description})` : ''}`;
        aoa.push([ddmmyyyy(day.date), code, content, cell(thu), cell(chi), ton]);
        thuTotal += thu;
        chiTotal += chi;
        rowCount++;
      }
    }
    const last = days[days.length - 1];
    aoa.push(['TỔNG PHÁT SINH', '', '', round2(thuTotal), round2(chiTotal), '']);
    aoa.push(['SỐ TỒN CUỐI THÁNG', '', '', '', '', closing(last)]);
    sheets.push({ name: `Tháng ${m}-${y}`, aoa });
    void rowCount;
  }

  const summary: ReportSheet = {
    name: 'Tổng hợp',
    aoa: [
      ['Báo cáo', `Sổ quỹ theo dõi thu chi ${providerName} — Loại quỹ: ${currency}`],
      ['Chi nhánh', `${book.branch.code} - ${book.branch.name}`],
      ['Từ ngày', ddmmyyyy(book.dateFrom)],
      ['Đến ngày', ddmmyyyy(book.dateTo)],
      ['Thời điểm xuất', generatedAt],
      [],
      ['Ngày', `Số GD ${provider}`, `Chi ${provider} ${currency}`, `Tổng thu ${currency}`, `Tổng chi ${currency}`, `Tồn cuối ${currency}`],
      ...book.days.map((d) => {
        const own = d.rows.filter((r) => r.kind === provider);
        return [
          ddmmyyyy(d.date), own.length,
          round2(own.reduce((s, r) => s + pick(r).chi, 0)),
          currency === 'USD' ? d.totalInUsd : d.totalInVnd,
          currency === 'USD' ? d.totalOutUsd : d.totalOutVnd,
          closing(d),
        ];
      }),
    ],
  };
  return { title, sheets: [summary, ...sheets] };
}
