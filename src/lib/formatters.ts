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
    return String(dateInput).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
  }
  
  const defaultOptions: Intl.DateTimeFormatOptions = options || {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  };

  // Format with requested locale (e.g., 'ar-SA' or 'en-US')
  const formatted = date.toLocaleDateString(locale, defaultOptions);
  
  // Replace all Eastern Arabic/Indic digits (٠-٩) with standard Latin digits (0-9)
  return formatted.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

/**
 * Formats a number to a decimal string using standard Latin digits and commas
 */
export function formatNumberWithLatinDigits(value: number | string | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || value === '') return '0.00';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0.00';
  
  const formatted = num.toFixed(decimals);
  // Ensure the decimal output only has Latin digits
  return formatted.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}
