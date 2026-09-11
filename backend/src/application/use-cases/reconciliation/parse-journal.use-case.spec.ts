import { ParseJournalUseCase } from './parse-journal.use-case';
import * as journalOcr from '../../../infrastructure/ocr/journal-ocr';
import type { IJournalPdfParser } from '../../ports/journal-pdf-parser.port';

jest.mock('../../../infrastructure/ocr/journal-ocr');

const fakeBytes = Buffer.from('%PDF-1.4 fake');

describe('ParseJournalUseCase.executePdf — Gemini là engine chính, Tesseract là dự phòng', () => {
  afterEach(() => jest.clearAllMocks());

  it('Gemini đọc được -> dùng thẳng kết quả Gemini, KHÔNG gọi Tesseract OCR', async () => {
    const gemini: IJournalPdfParser = {
      parse: jest.fn().mockResolvedValue([
        { code: '027-363-1579', amount: 382.43, currencyCode: 'USD', customerName: 'NGUYEN THI HANG' },
      ]),
    };
    const useCase = new ParseJournalUseCase(gemini);
    const result = await useCase.executePdf(fakeBytes, 'wu.pdf', 'WU');

    expect(result.rows).toEqual([
      { rowNo: 1, code: '0273631579', amount: 382.43, currencyCode: 'USD', customerName: 'NGUYEN THI HANG' },
    ]);
    expect(result.fileName).toBe('wu.pdf');
    expect(journalOcr.ocrPdfToText).not.toHaveBeenCalled();
  });

  it('Mã Gemini trả về không hợp lệ -> đẩy vào errors, không lẫn vào rows', async () => {
    const gemini: IJournalPdfParser = {
      parse: jest.fn().mockResolvedValue([
        { code: '123', amount: 100, currencyCode: 'USD' }, // WU cần đúng 10 số
      ]),
    };
    const useCase = new ParseJournalUseCase(gemini);
    const result = await useCase.executePdf(fakeBytes, 'wu.pdf', 'WU');

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([{ rowNo: 1, message: 'MTCN không hợp lệ: "123" (cần đúng 10 chữ số)' }]);
  });

  it('Gemini lặp dòng khi bảng trải nhiều trang -> chỉ giữ 1 dòng theo code+currency', async () => {
    const gemini: IJournalPdfParser = {
      parse: jest.fn().mockResolvedValue([
        { code: '0273631579', amount: 382.43, currencyCode: 'USD' },
        { code: '0273631579', amount: 382.43, currencyCode: 'USD' },
      ]),
    };
    const useCase = new ParseJournalUseCase(gemini);
    const result = await useCase.executePdf(fakeBytes, 'wu.pdf', 'WU');

    expect(result.rows).toHaveLength(1);
  });

  it('Gemini lỗi (thiếu key, hết quota, mạng...) -> tự rơi về Tesseract OCR, không chặn nghiệp vụ', async () => {
    const gemini: IJournalPdfParser = { parse: jest.fn().mockRejectedValue(new Error('Chưa cấu hình GEMINI_API_KEY')) };
    jest.mocked(journalOcr.ocrPdfToText).mockResolvedValue(
      '10/08/2026 15 440-280-1610 VO THI BACH TUYET USD 1.000,00 USD 0,00',
    );
    const useCase = new ParseJournalUseCase(gemini);
    const result = await useCase.executePdf(fakeBytes, 'wu.pdf', 'WU');

    expect(journalOcr.ocrPdfToText).toHaveBeenCalledWith(fakeBytes);
    expect(result.rows).toEqual([
      { rowNo: 1, code: '4402801610', amount: 1000, currencyCode: 'USD', customerName: 'VO THI BACH TUYET' },
    ]);
  });

  it('Không cấu hình Gemini (không inject port) -> đi thẳng Tesseract OCR', async () => {
    jest.mocked(journalOcr.ocrPdfToText).mockResolvedValue(
      '10/08/2026 15 440-280-1610 VO THI BACH TUYET USD 1.000,00 USD 0,00',
    );
    const useCase = new ParseJournalUseCase(undefined);
    const result = await useCase.executePdf(fakeBytes, 'wu.pdf', 'WU');

    expect(journalOcr.ocrPdfToText).toHaveBeenCalled();
    expect(result.rows).toHaveLength(1);
  });

  it('Cả Gemini lẫn Tesseract đều không đọc được gì -> báo lỗi rõ ràng cho người dùng', async () => {
    const gemini: IJournalPdfParser = { parse: jest.fn().mockRejectedValue(new Error('network')) };
    jest.mocked(journalOcr.ocrPdfToText).mockResolvedValue('   ');
    const useCase = new ParseJournalUseCase(gemini);

    await expect(useCase.executePdf(fakeBytes, 'wu.pdf', 'WU')).rejects.toThrow('Không đọc được nội dung nào từ file PDF.');
  });
});
