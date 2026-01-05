import * as XLSX from 'xlsx';

export type CsvCell = string | number | boolean | null | undefined;
export type CsvRow = Record<string, CsvCell>;

function escapeCsvCell(value: CsvCell): string {
  const asString = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(asString)) {
    return `"${asString.replace(/"/g, '""')}"`;
  }
  return asString;
}

export function toCsv(rows: CsvRow[], columns?: string[]): string {
  if (rows.length === 0) return '';

  const header = columns ?? Object.keys(rows[0]);
  const lines: string[] = [];

  lines.push(header.map(escapeCsvCell).join(','));
  for (const row of rows) {
    lines.push(header.map((key) => escapeCsvCell(row[key])).join(','));
  }

  return lines.join('\n');
}

export function downloadCsv(filename: string, csvText: string): void {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

export function downloadXlsx(filename: string, rows: CsvRow[], columns?: string[]): void {
  if (rows.length === 0) return;

  const header = columns ?? Object.keys(rows[0]);
  const data = rows.map(row => header.map(key => row[key] ?? ''));

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...data]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

  XLSX.writeFile(workbook, filename);
}

