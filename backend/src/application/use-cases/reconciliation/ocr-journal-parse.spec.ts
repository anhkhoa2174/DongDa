import { parseOcrJournalText } from './ocr-journal-parse';

describe('parseOcrJournalText', () => {
  it('trích mã, số tiền và tên khách từ dòng WU (bỏ token tiền tệ lẫn vào tên)', () => {
    const text = [
      'Ngày Mã Người Điều Hành MTCN Loại Chi Trả Tên Người Nhận Số Tiền Thanh Toán Thuế',
      '10/08/2026 15 440-280-1610 VO THI BACH TUYET USD 1.000,00 USD 0,00',
      '10/08/2026 15 633-775-1692 NGUYEN VAN A VND 5.000.000 VND 0',
    ].join('\n');
    const res = parseOcrJournalText(text, 'wu.pdf', 'WU');
    expect(res.rows).toEqual([
      { rowNo: 2, code: '4402801610', amount: 1000, currencyCode: 'USD', customerName: 'VO THI BACH TUYET' },
      { rowNo: 3, code: '6337751692', amount: 5000000, currencyCode: 'VND', customerName: 'NGUYEN VAN A' },
    ]);
  });

  it('trích mã, số tiền và tên từ dòng MG', () => {
    const res = parseOcrJournalText('1 10/07/2026 47161829 DONG PHAM HUONG DIEM HA HENRY 200.00 USD', 'mg.pdf', 'MG');
    expect(res.rows).toEqual([
      { rowNo: 1, code: '47161829', amount: 200, currencyCode: 'USD', customerName: 'DONG PHAM HUONG DIEM HA HENRY' },
    ]);
  });
});
