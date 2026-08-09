// Use Case: Parse file WU/MG Journal cuối ngày -> danh sách dòng đối chiếu
// Layer: Application
//
// F9.2 / F9.3: KTTH upload báo cáo WU/MG Journal (CSV/XLSX). Hệ thống đọc file,
// dò cột theo tiêu đề (MSKH/Reference, Amount, Tên KH, Currency) rồi trả về các
// dòng đã chuẩn hoá + các dòng lỗi. Kết quả feed vào RunReconciliationUseCase.

import { Injectable, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';

export interface ParsedJournalRow {
  rowNo: number; // số dòng trong file (1-based, tính cả header)
  code: string; // MSKH (WU) / Reference (MG)
  amount: number; // USD
  currencyCode: 'USD' | 'VND';
  customerName?: string;
}

export interface JournalParseError {
  rowNo: number;
  message: string;
}

export interface ParseJournalResult {
  provider: 'WU' | 'MG';
  fileName: string;
  detectedColumns: Record<string, number>; // tên field -> chỉ số cột đã dò được
  rows: ParsedJournalRow[];
  errors: JournalParseError[];
  summary: { total: number; parsed: number; failed: number };
}

const MAX_ROWS = 5000;

// Từ khoá dò cột theo tiêu đề (không dấu, thường hoá) — bao gồm cả tiếng Việt có dấu.
const COLUMN_KEYWORDS = {
  code: ['mskh', 'mtcn', 'reference', 'refno', 'ref', 'ma', 'code', 'sothamchieu', 'mã'],
  amount: ['amountusd', 'usd', 'amount', 'sotien', 'sotienusd', 'số tiền', 'sotiengoc'],
  customerName: ['customername', 'customer', 'hoten', 'ten', 'name', 'khachhang', 'họ tên', 'kh'],
  currency: ['currency', 'ccy', 'loaitien', 'tiente', 'loại tiền'],
};

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // bỏ dấu tiếng Việt
    .replace(/đ/g, 'd')
    .replace(/\s+/g, '')
    .trim();
}

// "25,000.50" | "25000" | " 100 " -> 100 ; định dạng US (WU/MG xuất tiếng Anh)
function parseAmount(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^0-9.\-]/g, ''); // bỏ dấu phẩy ngăn cách nghìn, ký tự tiền tệ
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

@Injectable()
export class ParseJournalUseCase {
  execute(fileBuffer: Buffer, fileName: string, provider: 'WU' | 'MG'): ParseJournalResult {
    if (!fileBuffer?.length) throw new BadRequestException('File rỗng hoặc không đọc được');
    if (provider !== 'WU' && provider !== 'MG') {
      throw new BadRequestException('provider phải là WU hoặc MG');
    }

    let sheet: XLSX.WorkSheet;
    try {
      const wb = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error('empty');
      sheet = wb.Sheets[sheetName];
    } catch {
      throw new BadRequestException('Không đọc được file. Chỉ hỗ trợ CSV hoặc Excel (.xlsx/.xls)');
    }

    const matrix: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
    if (matrix.length === 0) throw new BadRequestException('File không có dữ liệu');

    // Dò dòng tiêu đề: dòng đầu tiên chứa được cột "code" và "amount".
    let headerRowIdx = -1;
    let columnMap: Record<string, number> = {};
    for (let i = 0; i < Math.min(matrix.length, 15); i++) {
      const headers = matrix[i].map(normalizeHeader);
      const map = this.detectColumns(headers);
      if (map.code !== undefined && map.amount !== undefined) {
        headerRowIdx = i;
        columnMap = map;
        break;
      }
    }
    if (headerRowIdx === -1) {
      throw new BadRequestException(
        'Không tìm thấy cột bắt buộc. File Journal cần có cột mã (MSKH/Reference) và cột số tiền (Amount).',
      );
    }

    const rows: ParsedJournalRow[] = [];
    const errors: JournalParseError[] = [];
    const dataRows = matrix.slice(headerRowIdx + 1);
    if (dataRows.length > MAX_ROWS) {
      throw new BadRequestException(`File quá lớn (>${MAX_ROWS} dòng). Vui lòng tách nhỏ.`);
    }

    for (let i = 0; i < dataRows.length; i++) {
      const rowNo = headerRowIdx + 1 + i + 1; // 1-based, tính cả header
      const raw = dataRows[i];
      const codeCell = raw[columnMap.code];
      const amountCell = raw[columnMap.amount];

      // Dòng trống hoàn toàn -> bỏ qua, không tính lỗi
      const isEmpty = raw.every((c) => String(c ?? '').trim() === '');
      if (isEmpty) continue;

      const code = String(codeCell ?? '').trim().toUpperCase();
      if (!code) {
        errors.push({ rowNo, message: 'Thiếu mã MSKH/Reference' });
        continue;
      }
      const amount = parseAmount(amountCell);
      if (amount === null || amount <= 0) {
        errors.push({ rowNo, message: `Số tiền không hợp lệ: "${String(amountCell ?? '')}"` });
        continue;
      }

      let currencyCode: 'USD' | 'VND' = 'USD';
      if (columnMap.currency !== undefined) {
        const ccy = String(raw[columnMap.currency] ?? '').trim().toUpperCase();
        if (ccy === 'VND') currencyCode = 'VND';
      }
      const customerName = columnMap.customerName !== undefined
        ? String(raw[columnMap.customerName] ?? '').trim() || undefined
        : undefined;

      rows.push({ rowNo, code, amount, currencyCode, customerName });
    }

    return {
      provider,
      fileName,
      detectedColumns: columnMap,
      rows,
      errors,
      summary: { total: rows.length + errors.length, parsed: rows.length, failed: errors.length },
    };
  }

  private detectColumns(headers: string[]): Record<string, number> {
    const map: Record<string, number> = {};
    for (const [field, keywords] of Object.entries(COLUMN_KEYWORDS)) {
      // Ưu tiên khớp chính xác trước, rồi tới chứa từ khoá.
      let idx = headers.findIndex((h) => h && keywords.some((k) => h === normalizeHeader(k)));
      if (idx === -1) {
        idx = headers.findIndex((h) => h && keywords.some((k) => h.includes(normalizeHeader(k))));
      }
      if (idx !== -1) map[field] = idx;
    }
    return map;
  }
}