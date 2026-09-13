import { HealthCheckResponse } from '@crm/shared';

export async function fetchHealthStatus(): Promise<HealthCheckResponse> {
  const response = await fetch('/api/health');
  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status}`);
  }
  return response.json();
}
