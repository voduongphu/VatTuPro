/**
 * Converts numeric currency amount into formal Vietnamese words
 * e.g. 15414000 -> "Mười lăm triệu bốn trăm mười bốn nghìn đồng chẵn."
 */

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const SCALES = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

function readGroup(threeDigits: string): string {
  const num = parseInt(threeDigits, 10);
  if (num === 0) return '';

  const hundreds = Math.floor(num / 100);
  const tens = Math.floor((num % 100) / 10);
  const units = num % 10;

  let result = '';

  if (hundreds > 0 || threeDigits.length === 3) {
    result += `${DIGITS[hundreds]} trăm `;
  }

  if (tens === 0 && units > 0 && (hundreds > 0 || threeDigits.length === 3)) {
    result += 'lẻ ';
  } else if (tens === 1) {
    result += 'mười ';
  } else if (tens > 1) {
    result += `${DIGITS[tens]} mươi `;
  }

  if (tens > 1 && units === 1) {
    result += 'mốt';
  } else if (tens >= 1 && units === 5) {
    result += 'lăm';
  } else if (units > 0) {
    result += DIGITS[units];
  }

  return result.trim();
}

export function numberToWordsVietnamese(amount: number): string {
  if (!amount || isNaN(amount) || amount === 0) {
    return 'Không đồng chẵn.';
  }

  const isNegative = amount < 0;
  const absAmount = Math.abs(Math.round(amount));

  const str = absAmount.toString();
  const groups: string[] = [];

  for (let i = str.length; i > 0; i -= 3) {
    const start = Math.max(0, i - 3);
    groups.unshift(str.substring(start, i));
  }

  let result = '';
  const totalGroups = groups.length;

  for (let i = 0; i < totalGroups; i++) {
    const groupStr = groups[i];
    const groupWord = readGroup(groupStr);

    if (groupWord) {
      const scaleIndex = totalGroups - 1 - i;
      const scale = SCALES[scaleIndex] || '';
      result += `${groupWord} ${scale} `;
    }
  }

  result = result.trim();
  if (!result) return 'Không đồng chẵn.';

  // Capitalize first letter
  result = result.charAt(0).toUpperCase() + result.slice(1);

  if (isNegative) {
    result = `Âm ${result.toLowerCase()}`;
  }

  return `${result} đồng chẵn.`;
}
