// Tách text OCR (từ PDF scan) của Journal WU/MG thành các dòng đối chiếu.
// Layer: Application (thuần, testable).
//
// OCR không hoàn hảo -> chỉ trích được thì trích, KTTH rà lại/sửa trên UI trước khi đối chiếu.

import type { ParsedJournalRow, JournalParseError, ParseJournalResult } from './parse-journal.use-case';

// "1.000,00" (VN: '.' phân nghìn, ',' thập phân) -> 1000
function parseVnAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

// "200.00" hoặc "1,000.00" (US: ',' phân nghìn, '.' thập phân) -> 200 / 1000
function parseUsAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,]/g, '').replace(/,/g, '');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

interface Extracted {
  code: string;
  amount: number;
  currencyCode: 'USD' | 'VND';
  customerName?: string;
}

// WU: "10/08/2026 15 440-280-1610 VO THI BACH TUYET USD 1.000,00 USD 0,00"
// MTCN = 10 số (có/không gạch), số tiền kiểu VN, có 2 khoản USD (chi trả + thuế) -> lấy khoản ĐẦU.
function extractWuLine(line: string): Extracted | null {
  // Mã MTCN 10 số; OCR có thể dùng gạch/chấm/space bất kỳ giữa các nhóm.
  const codeMatch = line.match(/(?<!\d)(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})(?!\d)/);
  if (!codeMatch) return null;
  const code = codeMatch[1].replace(/\D/g, '');
  if (code.length !== 10) return null;

  const after = line.slice(codeMatch.index! + codeMatch[0].length);
  // Xác định tiền tệ trước: dòng VND (không có USD) vs dòng USD.
  const currencyCode: 'USD' | 'VND' = /VN[DĐ]/i.test(line) && !/USD/i.test(line) ? 'VND' : 'USD';
  let amount: number | null = null;
  let amtIndex = -1;
  if (currencyCode === 'VND') {
    // VND: số nguyên (triệu). OCR dùng '.'/','/không dấu tùy dòng -> bỏ hết dấu.
    const m = after.match(/(\d[\d.,]{4,}\d)/);
    if (m) { amount = Number.parseInt(m[1].replace(/\D/g, ''), 10); amtIndex = m.index!; }
  } else {
    // USD: "1.000,00" (khoản đầu = chi trả, khoản sau = thuế)
    const m = after.match(/(\d[\d.]*,\d{1,2})/) || after.match(/(?:USD)\s*(\d{3,})/i);
    if (m) { amount = parseVnAmount(m[1]); amtIndex = m.index!; }
  }
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return null;

  const between = amtIndex >= 0 ? after.slice(0, amtIndex) : after;
  const customerName = between.replace(/[^A-Za-zÀ-ỹ\s]/g, '').replace(/\s+/g, ' ').trim() || undefined;
  return { code, amount, currencyCode, customerName };
}

// MG: "1 10/07/2026 47161829 DONG PHAM HUONG DIEM HA HENRY 200.00 USD"
// Mã = 8 số, số tiền kiểu US.
function extractMgLine(line: string): Extracted | null {
  const codeMatch = line.match(/(?<!\d)(\d{8})(?!\d)/);
  if (!codeMatch) return null;
  const code = codeMatch[1];

  // số tiền dạng US có phần thập phân (200.00) hoặc kèm USD/VND
  const amtMatch = line.match(/([\d,]*\d\.\d{2})/) || line.match(/(USD|VND)\s*([\d,.]+)/i);
  if (!amtMatch) return null;
  const amountStr = amtMatch[amtMatch.length - 1];
  const amount = parseUsAmount(amountStr);
  if (amount === null || amount <= 0) return null;
  const currencyCode = /VND/i.test(line) && !/USD/i.test(line) ? 'VND' : 'USD';

  const between = line.slice(codeMatch.index! + 8, amtMatch.index).trim();
  const customerName = between.replace(/[^A-Za-zÀ-ỹ\s]/g, '').replace(/\s+/g, ' ').trim() || undefined;
  return { code, amount, currencyCode, customerName };
}

// Dòng tiêu đề/tổng/chân trang -> bỏ qua (tránh bắt nhầm mã yêu cầu, tổng tiền...).
const NOISE_RE = /(tổng|tong cong|tong so|mã yêu cầu|ma yeu cau|tên đại lý|ten dai ly|ngày yêu cầu|ngay yeu cau|tgtt|danh sách|danh sach|báo cáo|bao cao|số tk|so tk|loại tiền giao dịch|loai tien giao dich|người điều hành|nguoi dieu hanh|họ tên người|ho ten nguoi)/i;

export function parseOcrJournalText(
  text: string,
  fileName: string,
  provider: 'WU' | 'MG',
): ParseJournalResult {
  const lines = text.split(/\r?\n/);
  const rows: ParsedJournalRow[] = [];
  const errors: JournalParseError[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (NOISE_RE.test(line)) continue; // dòng tiêu đề/tổng
    const ex = provider === 'WU' ? extractWuLine(line) : extractMgLine(line);
    if (!ex) continue;
    // chống trùng mã (OCR có thể lặp), giữ dòng đầu
    if (seen.has(ex.code)) continue;
    seen.add(ex.code);
    rows.push({
      rowNo: i + 1,
      code: ex.code,
      amount: ex.amount,
      currencyCode: ex.currencyCode,
      customerName: ex.customerName,
    });
  }

  return {
    provider,
    fileName,
    detectedColumns: {},
    rows,
    errors,
    summary: { total: rows.length, parsed: rows.length, failed: errors.length },
  };
}
