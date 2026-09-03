const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const UNITS = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

export function vndAmountInWords(amount: number): string {
  const integer = Math.trunc(amount);
  if (!Number.isSafeInteger(integer) || integer < 0) throw new Error('Số tiền không hợp lệ để chuyển thành chữ');
  if (integer === 0) return 'Không đồng';

  const groups: number[] = [];
  let remaining = integer;
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }
  const words: string[] = [];
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    if (groups[index] === 0) continue;
    words.push(readThreeDigits(groups[index], index < groups.length - 1));
    if (UNITS[index]) words.push(UNITS[index]);
  }
  const text = `${words.join(' ').replace(/\s+/g, ' ').trim()} đồng`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function readThreeDigits(value: number, readLeadingZero: boolean) {
  const hundreds = Math.floor(value / 100);
  const tens = Math.floor((value % 100) / 10);
  const ones = value % 10;
  const words: string[] = [];
  if (hundreds > 0 || readLeadingZero) {
    words.push(DIGITS[hundreds], 'trăm');
  }
  if (tens === 0) {
    if (ones > 0 && (hundreds > 0 || readLeadingZero)) words.push('lẻ');
  } else if (tens === 1) {
    words.push('mười');
  } else {
    words.push(DIGITS[tens], 'mươi');
  }
  if (ones > 0) {
    if (tens > 1 && ones === 1) words.push('mốt');
    else if (tens > 0 && ones === 5) words.push('lăm');
    else words.push(DIGITS[ones]);
  }
  return words.join(' ');
}
