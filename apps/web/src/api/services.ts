import { fetchWithAuth } from './auth';

export interface ServiceItem {
  id: number;
  code: string;
  name: string;
  service_type: 'PROJECT' | 'RECURRING';
  description?: string | null;
  is_active: boolean;
  defaultPrice: number;
}

export async function getServicesApi(): Promise<ServiceItem[]> {
  const res = await fetchWithAuth('/api/services');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to fetch services');
  }
  return res.json();
}
