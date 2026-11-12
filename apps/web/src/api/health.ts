import { HealthCheckResponse } from '@crm/shared';
import { buildApiUrl } from './config';

export async function fetchHealthStatus(): Promise<HealthCheckResponse> {
  const response = await fetch(buildApiUrl('/health'));
  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status}`);
  }
  return response.json();
}
