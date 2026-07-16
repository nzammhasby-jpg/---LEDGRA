/**
 * Utility functions for exporting financial and operational reports to CSV format.
 * Includes UTF-8 BOM to ensure Arabic characters open correctly in Excel.
 */

export type CSVCell = string | number | boolean | null | undefined;

/**
 * Escapes a single string value for safe inclusion in a CSV file.
 * Doubles any inner quotes and wraps the field in double quotes if it contains commas, quotes, or newlines.
 * Also protects against CSV Formula Injection while preserving true negative and positive numbers.
 */
export function escapeCSVValue(val: CSVCell): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  
  // Protect against CSV Formula Injection if it starts with =, +, -, @, \t, \r
  // but do NOT corrupt true negative/positive numbers (e.g. -125.50 or +45.00)
  const isNumber = !isNaN(Number(str)) && str !== '';
  if (!isNumber && (str.startsWith('=') || str.startsWith('+') || str.startsWith('-') || str.startsWith('@') || str.startsWith('\t') || str.startsWith('\r'))) {
    str = `'${str}`;
  }

  // If the value has double quotes, escape them by doubling them
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    str = str.replace(/"/g, '""');
    return `"${str}"`;
  }
  return str;
}

/**
 * Generates a raw CSV string from an array of headers and rows of data.
 */
export function generateCSV(headers: string[], rows: CSVCell[][]): string {
  const headerLine = headers.map(escapeCSVValue).join(',');
  const rowLines = rows.map(row => row.map(escapeCSVValue).join(','));
  return [headerLine, ...rowLines].join('\r\n');
}

/**
 * Initiates a browser download for a CSV string with a UTF-8 BOM pre-appended.
 */
export function downloadCSV(csvContent: string, filename: string): void {
  // Prepend UTF-8 BOM
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
  
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * Helper to generate a standardized, safe filename for reports.
 */
export function generateReportFilename(reportNameAr: string, dateFrom?: string, dateTo?: string): string {
  const dateStr = dateFrom && dateTo ? `_${dateFrom}_to_${dateTo}` : `_${new Date().toISOString().split('T')[0]}`;
  const safeName = reportNameAr.replace(/[\s/\\?%*:|"<>]/g, '_');
  return `ledgra_${safeName}${dateStr}.csv`;
}
