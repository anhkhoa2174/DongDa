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

  it('MG scan CamScanner tách mỗi ô 1 dòng (bản VND) — đọc theo khối vẫn ra giao dịch, tên người nhận là dòng đầu', () => {
    const text = [
      'MA YÊU CẦU: MT9_VND_20260813_1 -', 'BAO.CAO CHI TRÀ MONEYGRAM', 'TONG SO TIEN: 8,855,014',
      'STT |Ngày chi trả', 'Mã số giao dịch', 'Họ tên người nhận', 'Họ tên người gửi', 'Số tiền | Loại tiền', '-—',
      '10/08/2026', '', '91857574', '', 'THI MY AN NGUYEN', '', 'NGUYEN SAO NAM', '', '8,855,014 | VND', '',
      'TỔNG CỘNG 8,855,014 | VND',
    ].join('\n');
    const res = parseOcrJournalText(text, 'mg-vnd.pdf', 'MG');
    expect(res.rows).toEqual([
      { rowNo: 10, code: '91857574', amount: 8855014, currencyCode: 'VND', customerName: 'THI MY AN NGUYEN' },
    ]);
  });

  it('MG scan bản USD 3 dòng, có mã yêu cầu MT9_USD_20260825_1 không bị nhận nhầm thành giao dịch', () => {
    const text = [
      'MA YEU CÀU: MT9_USD_20260825_1 TONG SO TIEN: 1,000.00',
      '1 23/08/2026 14864919 LE TRUNG KHANH TRAN PHUONG 300.00 | USD',
      '2 20/08/2026 52524077 MINH TU NGUYEN LE QUANG TUAN 500.00 | USD',
      '22/08/2026 50461016 LE TRUNG KHANH TRAN PHUONG 200.00 | USD >',
      'TONG CONG 1,000.00 | USD',
    ].join('\n');
    const res = parseOcrJournalText(text, 'mg-usd.pdf', 'MG');
    expect(res.rows.map((r) => [r.code, r.amount, r.currencyCode])).toEqual([
      ['14864919', 300, 'USD'], ['52524077', 500, 'USD'], ['50461016', 200, 'USD'],
    ]);
  });
});
