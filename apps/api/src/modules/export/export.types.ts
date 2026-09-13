/**
 * Phase O: Export Types and Column Definitions
 */

export type ExcelCellFormat = 'text' | 'number' | 'currency' | 'date' | 'datetime';

export interface ExcelColumnDef<T = any> {
  header: string;
  key: string;
  width?: number;
  format?: ExcelCellFormat;
  getValue?: (row: T) => any;
}

export interface ExportResult {
  filename: string;
  buffer: Buffer;
  mimeType: string;
  rowCount: number;
}
