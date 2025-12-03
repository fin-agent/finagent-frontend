/**
 * Sanitizes a single cell value for CSV output.
 * If the value contains a comma, newline, or double quote, it will be
 * wrapped in double quotes, and any internal double quotes will be escaped (doubled).
 * @param value The value to sanitize.
 * @returns A CSV-safe string.
 */
function sanitizeCell(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }
  
  let strValue = String(value);

  // Regex to check if quoting is needed
  const needsQuotes = /[\n",]/.test(strValue);

  if (needsQuotes) {
    // Escape double quotes by doubling them (e.g., " -> "")
    const escapedValue = strValue.replace(/"/g, '""');
    // Wrap the entire value in double quotes
    return `"${escapedValue}"`;
  }

  return strValue;
}

/**
 * Converts an array of objects into a CSV string.
 * @param data The array of data objects (e.g., from Supabase).
 * @param columns The array of column headers, in the desired order.
 * @returns A string formatted as CSV.
 */
export function convertToCSV(data: any[], columns: string[]): string {
  // 1. Create the header row
  const header = columns.map(sanitizeCell).join(',');

  // 2. Create the data rows
  const rows = data.map(row => {
    return columns.map(col => {
      // Get the value for the specific column and sanitize it
      return sanitizeCell(row[col]);
    }).join(',');
  });

  // 3. Join header and all rows with newline characters
  return [header, ...rows].join('\n');
}
