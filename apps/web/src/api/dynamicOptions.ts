import { fetchWithAuth } from './auth';

export interface DynamicOptionItem {
  id: string;
  field_key: string;
  value: string;
  normalized_value: string;
  usage_count: number;
  last_used_at: string;
  created_at: string;
  updated_at: string;
}

export async function fetchDynamicOptions(
  fieldKey: string,
  q?: string,
  limit?: number,
): Promise<DynamicOptionItem[]> {
  const params = new URLSearchParams();
  params.set('fieldKey', fieldKey);
  if (q && q.trim()) params.set('q', q.trim());
  if (limit) params.set('limit', String(limit));

  const res = await fetchWithAuth(`/api/dynamic-options?${params.toString()}`);
  if (!res.ok) {
    throw new Error('Failed to fetch dynamic options');
  }
  return res.json();
}

export async function recordOptionUse(
  fieldKey: string,
  value: string,
): Promise<DynamicOptionItem> {
  const res = await fetchWithAuth('/api/dynamic-options/use', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fieldKey, value }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to record option usage');
  }
  return res.json();
}
