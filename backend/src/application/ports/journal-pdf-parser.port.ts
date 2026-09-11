// Port: đọc file Journal WU/MG dạng PDF (scan hoặc bản gốc) -> danh sách dòng thô.
// Layer: Application — không phụ thuộc engine cụ thể (Gemini, Tesseract...).

export interface JournalPdfParserInput {
  bytes: Buffer;
  fileName: string;
  provider: 'WU' | 'MG';
}

export interface ParsedJournalPdfRow {
  code: string;
  amount: number;
  currencyCode: 'USD' | 'VND';
  customerName?: string;
}

export interface IJournalPdfParser {
  parse(input: JournalPdfParserInput): Promise<ParsedJournalPdfRow[]>;
}
