import { vndAmountInWords } from './vietnamese-money-words';

describe('vndAmountInWords', () => {
  it.each([
    [100_000, 'Một trăm nghìn đồng'],
    [105_000, 'Một trăm lẻ năm nghìn đồng'],
    [1_025_000, 'Một triệu không trăm hai mươi lăm nghìn đồng'],
    [156_980, 'Một trăm năm mươi sáu nghìn chín trăm tám mươi đồng'],
  ])('writes %i VND as Vietnamese words', (amount, expected) => {
    expect(vndAmountInWords(amount)).toBe(expected);
  });
});
