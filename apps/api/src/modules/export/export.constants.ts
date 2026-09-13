/**
 * Phase O: Export Excel / PDF Constants
 */

// Formula injection dangerous leading characters (CSV / Excel injection)
export const FORMULA_INJECTION_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

// Bounded export row limit safeguard (CONFIGURABLE via env, default 5000).
// NOTE: EXPORT LARGE DATA MODEL = BOUNDED IN-MEMORY V1 (not streaming).
export const DEFAULT_MAX_EXPORT_ROWS = 5000;
export const MAX_EXPORT_ROWS = process.env.MAX_EXPORT_ROWS
  ? parseInt(process.env.MAX_EXPORT_ROWS, 10)
  : DEFAULT_MAX_EXPORT_ROWS;

// Default styling tokens for ExcelJS sheets
export const EXCEL_STYLES = {
  HEADER_FILL_COLOR: '1E293B', // Dark Slate
  HEADER_FONT_COLOR: 'FFFFFF',
  HEADER_FONT_NAME: 'Segoe UI',
  HEADER_FONT_SIZE: 11,
  ROW_FONT_NAME: 'Segoe UI',
  ROW_FONT_SIZE: 10,
  BORDER_COLOR: 'CBD5E1',
};
