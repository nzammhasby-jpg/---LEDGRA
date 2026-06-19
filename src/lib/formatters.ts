/**
 * Formats a date of type Date or string into English digits (Latin numerals).
 * Generates Arabic text (e.g. week days, month names) if locale is set to 'ar-SA',
 * but ensures that no Arabic-Indic digits (٠-٩) are rendered.
 */
export function formatArabicDateWithLatinDigits(
  dateInput: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
  locale = 'ar-SA'
): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) {
    return toEnglishDigits(String(dateInput));
  }
  
  const defaultOptions: Intl.DateTimeFormatOptions = options || {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  };

  // Format with requested locale (e.g., 'ar-SA' or 'en-US')
  const formatted = date.toLocaleDateString(locale, defaultOptions);
  
  // Replace all Eastern Arabic/Indic/Persian digits with standard Latin digits (0-9)
  return toEnglishDigits(formatted);
}

/**
 * Formats a number to a decimal string using standard Latin digits and commas
 */
export function formatNumberWithLatinDigits(value: number | string | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || value === '') return '0.00';
  const num = typeof value === 'string' ? parseFloat(toEnglishDigits(value).replace(/,/g, '')) : value;
  if (isNaN(num) || !isFinite(num)) return '0.00';
  
  const formatted = num.toFixed(decimals);
  // Ensure the decimal output only has Latin digits
  return toEnglishDigits(formatted);
}

/**
 * Converts Arabic-Indic and Persian digits to English digits, and maps decimal separators.
 * ٠١٢٣٤٥٦٧٨٩ -> 0123456789
 * ۰۱۲۳۴۵۶۷۸۹ -> 0123456789
 * ٫ -> .
 * ٬ -> ,
 */
export function toEnglishDigits(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  let str = String(value);
  // Arabic-Indic digits (٠-٩)
  str = str.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
  // Persian-Arabic digits (۰-۹)
  str = str.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
  // Punctuation and separators
  str = str.replace(/٫/g, '.');
  str = str.replace(/٬/g, ',');
  return str;
}

/**
 * Normalizes input digits, keeping non-digit characters unchanged but digit-translating them.
 */
export function normalizeInputDigits(value: string | null | undefined): string {
  return toEnglishDigits(value);
}

/**
 * Normalizes an integer input string, removing any characters that are not 0-9.
 * Does not turn empty fields into 0.
 */
export function normalizeIntegerInput(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const norm = toEnglishDigits(value);
  return norm.replace(/[^0-9]/g, '');
}

/**
 * Normalizes a decimal or monetary input, supporting only digits and at most one decimal period '.'.
 * Strips out thousands separators like ',' and translates format.
 * Does not turn empty fields into 0.
 */
export function normalizeDecimalInput(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  let norm = toEnglishDigits(value);
  
  // Remove commas to avoid parsing issues or invalid characters
  norm = norm.replace(/,/g, '');
  
  // Strip non-numeric/non-decimal-point/non-minus-sign characters
  let clean = norm.replace(/[^0-9.-]/g, '');
  
  // Ensure negative sign exists at most once and only as prefix
  const isNegative = clean.startsWith('-');
  clean = clean.replace(/-/g, '');
  if (isNegative) {
    clean = '-' + clean;
  }
  
  // Enforce single decimal period
  const parts = clean.split('.');
  if (parts.length > 2) {
    clean = parts[0] + '.' + parts.slice(1).join('');
  }
  
  return clean;
}

/**
 * Formats date to display Arabic text with strictly English (Latin) numbers.
 */
export function formatDateWithEnglishDigits(value: Date | string | null | undefined): string {
  return formatArabicDateWithLatinDigits(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Strips thousands separators (e.g. standard format commas) from a string for storage/calculation.
 */
export function removeThousandsSeparator(value: string | null | undefined): string {
  if (!value) return '';
  return toEnglishDigits(value).replace(/,/g, '');
}

/**
 * Parses numeric inputs safely, eliminating NaN or Infinity errors.
 */
export function safeParseFloat(value: any): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') {
    return isFinite(value) ? value : 0;
  }
  const clean = removeThousandsSeparator(String(value));
  const parsed = parseFloat(clean);
  return isNaN(parsed) || !isFinite(parsed) ? 0 : parsed;
}

/**
 * Parses integers safely, eliminating NaN or Infinity.
 */
export function safeParseInt(value: any): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') {
    return isFinite(value) ? Math.floor(value) : 0;
  }
  const clean = toEnglishDigits(String(value)).replace(/[^0-9-]/g, '');
  const parsed = parseInt(clean, 10);
  return isNaN(parsed) || !isFinite(parsed) ? 0 : parsed;
}

