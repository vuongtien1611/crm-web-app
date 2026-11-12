/**
 * Shared API configuration and URL builder.
 * Resolves API URL based on VITE_API_URL or defaults to '/api'.
 * Prevents double '/api/api' path duplication and handles cross-domain production deployments.
 */
const rawUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL ? String(import.meta.env.VITE_API_URL) : '').trim();

export function resolveBaseUrl(envUrl: string): string {
  if (!envUrl) {
    return '/api';
  }
  return envUrl.replace(/\/+$/, '');
}

export const API_BASE_URL = resolveBaseUrl(rawUrl);

/**
 * Standardized URL builder for CRM API calls.
 * Normalizes input paths to guarantee exactly one leading '/api' segment
 * when baseUrl does not contain domain or when baseUrl contains domain with/without '/api'.
 *
 * Examples:
 * - When API_BASE_URL is '/api':
 *   buildApiUrl('/leads') -> '/api/leads'
 *   buildApiUrl('/api/leads') -> '/api/leads'
 *   buildApiUrl('leads') -> '/api/leads'
 *
 * - When API_BASE_URL is 'https://api.vmaxcrm.vn/api':
 *   buildApiUrl('/leads') -> 'https://api.vmaxcrm.vn/api/leads'
 *   buildApiUrl('/api/leads') -> 'https://api.vmaxcrm.vn/api/leads'
 *
 * - When API_BASE_URL is 'https://api.vmaxcrm.vn':
 *   buildApiUrl('/leads') -> 'https://api.vmaxcrm.vn/api/leads'
 *   buildApiUrl('/api/leads') -> 'https://api.vmaxcrm.vn/api/leads'
 */
export function buildApiUrl(path: string): string {
  if (!path) return API_BASE_URL;

  // External absolute URLs (e.g. presigned S3 / storage URLs, external links)
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  // If API_BASE_URL ends with '/api' (e.g. '/api' or 'https://api.crm.com/api')
  if (API_BASE_URL.endsWith('/api')) {
    if (cleanPath.startsWith('/api/')) {
      return `${API_BASE_URL}${cleanPath.substring(4)}`;
    }
    if (cleanPath === '/api') {
      return API_BASE_URL;
    }
    return `${API_BASE_URL}${cleanPath}`;
  }

  // If API_BASE_URL does NOT end with '/api' (e.g. 'https://api.crm.com')
  if (cleanPath.startsWith('/api/') || cleanPath === '/api') {
    return `${API_BASE_URL}${cleanPath}`;
  }
  return `${API_BASE_URL}/api${cleanPath}`;
}

