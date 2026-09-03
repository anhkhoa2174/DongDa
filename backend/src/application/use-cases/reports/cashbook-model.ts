// Dựng "Sổ theo dõi thu chi hằng ngày" theo mẫu Excel sổ quỹ chi nhánh (docs/business/Official sổ theo dõi thu chi...):
// mỗi ngày 1 sheet (tên ddMM), header công ty/chi nhánh, tiêu đề, bảng
//   STT | Ngày | MTCN | Họ & tên người nhận | Nhận (USD, VND) | Chi (USD, VND) | Tồn (USD, VND)
// + dòng Tồn đầu kỳ, dòng Tổng cộng, dòng Tồn cuối kỳ. Người dùng chọn được cột hiển thị.
// Layer: Application (thuần) — dùng cho cả preview lẫn xuất Excel.

import type { CashBook, CashBookDay, CashBookRow, CashBookRowKind } from '../../../domain/repositories/reports.repository';
import type { ReportModel, ReportSheet } from './report-model';

export const CASHBOOK_COLUMNS = [
  'stt', 'date', 'time', 'kind', 'code', 'name', 'inUsd', 'inVnd', 'outUsd', 'outVnd', 'balanceUsd', 'balanceVnd', 'description',
] as const;
export type CashBookColumn = (typeof CASHBOOK_COLUMNS)[number];

// Mặc định = đúng các cột của sổ mẫu + Loại (vì sổ hệ thống gộp cả MG/FX/tiếp quỹ, không chỉ WU).
export const CASHBOOK_DEFAULT_COLUMNS: CashBookColumn[] = [
  'stt', 'date', 'kind', 'code', 'name', 'inUsd', 'inVnd', 'outUsd', 'outVnd', 'balanceUsd', 'balanceVnd',
];

const COLUMN_GROUP: Record<CashBookColumn, string> = {
  stt: 'STT', date: 'Ngày', time: 'Giờ', kind: 'Loại', code: 'MTCN / Mã', name: 'Họ & tên người nhận / Nguồn tiền',
  inUsd: 'Nhận', inVnd: 'Nhận', outUsd: 'Chi', outVnd: 'Chi', balanceUsd: 'Tồn', balanceVnd: 'Tồn', description: 'Diễn giải',
};
const COLUMN_SUB: Partial<Record<CashBookColumn, string>> = {
  inUsd: 'USD', inVnd: 'VND', outUsd: 'USD', outVnd: 'VND', balanceUsd: 'USD', balanceVnd: 'VND',
};

export const CASHBOOK_KIND_LABEL: Record<CashBookRowKind, string> = {
  WU: 'WU', MG: 'MG', FX: 'Ngoại tệ', DOMESTIC_TRANSFER: 'Chuyển tiền',
  FUND_IN: 'Tiếp quỹ nhận', FUND_OUT: 'Tiếp quỹ gửi', CASH_IN: 'Phiếu thu', CASH_OUT: 'Phiếu chi',
  DEBT_SETTLEMENT: 'Công nợ về', REVERSAL: 'Bút toán đảo', OTHER: 'Khác',
};

// MTCN 10 số hiển thị dạng 633-775-1692 như trong sổ mẫu.
function displayCode(row: CashBookRow): string {
  if (row.kind === 'WU' && /^\d{10}$/.test(row.code)) return `${row.code.slice(0, 3)}-${row.code.slice(3, 6)}-${row.code.slice(6)}`;
  return row.code;
}

function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function hhmm(date: Date): string {
  const d = new Date(date);
  // giờ Việt Nam
  const vn = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return `${String(vn.getUTCHours()).padStart(2, '0')}:${String(vn.getUTCMinutes()).padStart(2, '0')}`;
}

// null -> ô trống (giữ giống sổ mẫu: chỉ điền số ở cột có phát sinh)
const cell = (n: number) => (n ? n : '');

export function normalizeCashBookColumns(columns?: string[]): CashBookColumn[] {
  const wanted = (columns ?? []).filter((c): c is CashBookColumn => (CASHBOOK_COLUMNS as readonly string[]).includes(c));
  if (!wanted.length) return CASHBOOK_DEFAULT_COLUMNS;
  // giữ thứ tự chuẩn của sổ, không theo thứ tự người dùng gửi
  return CASHBOOK_COLUMNS.filter((c) => wanted.includes(c));
}

function daySheet(book: CashBook, day: CashBookDay, columns: CashBookColumn[]): ReportSheet {
  const width = columns.length;
  const pad = (arr: (string | number)[]) => [...arr, ...Array(Math.max(0, width - arr.length)).fill('')];
  const nameCol = columns.indexOf('name');
  const labelCol = nameCol >= 0 ? nameCol : Math.max(0, columns.findIndex((c) => c === 'code' || c === 'kind' || c === 'date'));

  const rowOf = (values: Partial<Record<CashBookColumn, string | number>>) => pad(columns.map((c) => values[c] ?? ''));

  const aoa: (string | number)[][] = [];
  aoa.push(pad([`Công ty TNHH TM DV PT Đống Đa — ${book.branch.name}${book.branch.address ? ` — ${book.branch.address}` : ''}`]));
  aoa.push(pad([`SỔ THEO DÕI THU CHI HẰNG NGÀY — ${ddmmyyyy(day.date)}`]));
  aoa.push(pad(columns.map((c) => COLUMN_GROUP[c])));
  aoa.push(pad(columns.map((c) => COLUMN_SUB[c] ?? '')));

  const opening = rowOf({ balanceUsd: day.openingUsd, balanceVnd: day.openingVnd });
  opening[labelCol] = 'Tồn đầu kỳ';
  aoa.push(opening);

  day.rows.forEach((r, i) => {
    aoa.push(rowOf({
      stt: i + 1,
      date: ddmmyyyy(day.date),
      time: hhmm(r.time),
      kind: CASHBOOK_KIND_LABEL[r.kind] ?? r.kind,
      code: displayCode(r),
      name: r.name,
      inUsd: cell(r.inUsd), inVnd: cell(r.inVnd),
      outUsd: cell(r.outUsd), outVnd: cell(r.outVnd),
      balanceUsd: r.balanceUsd, balanceVnd: r.balanceVnd,
      description: r.description,
    }));
  });

  const total = rowOf({ inUsd: day.totalInUsd, inVnd: day.totalInVnd, outUsd: day.totalOutUsd, outVnd: day.totalOutVnd });
  total[labelCol] = 'Tổng cộng';
  aoa.push(total);
  const closing = rowOf({ balanceUsd: day.closingUsd, balanceVnd: day.closingVnd });
  closing[labelCol] = 'Tồn cuối kỳ';
  aoa.push(closing);

  const [y, m, d] = day.date.split('-');
  return { name: `${d}${m}${y.slice(2)}`, aoa };
}

export function buildCashBookModel(book: CashBook, columns: CashBookColumn[], generatedAt: string): ReportModel {
  const title = `Sổ theo dõi thu chi hằng ngày — ${book.branch.code} ${book.branch.name}`;
  const summary: ReportSheet = {
    name: 'Tổng hợp',
    aoa: [
      ['Chi nhánh', `${book.branch.code} - ${book.branch.name}`],
      ['Từ ngày', ddmmyyyy(book.dateFrom)],
      ['Đến ngày', ddmmyyyy(book.dateTo)],
      ['Thời điểm xuất', generatedAt],
      [],
      ['Ngày', 'Tồn đầu USD', 'Tồn đầu VND', 'Nhận USD', 'Nhận VND', 'Chi USD', 'Chi VND', 'Tồn cuối USD', 'Tồn cuối VND', 'Số dòng'],
      ...book.days.map((d) => [
        ddmmyyyy(d.date), d.openingUsd, d.openingVnd, d.totalInUsd, d.totalInVnd, d.totalOutUsd, d.totalOutVnd, d.closingUsd, d.closingVnd, d.rows.length,
      ]),
    ],
  };
  const daySheets = book.days.filter((d) => d.rows.length > 0).map((d) => daySheet(book, d, columns));
  return { title, sheets: [summary, ...daySheets] };
}
