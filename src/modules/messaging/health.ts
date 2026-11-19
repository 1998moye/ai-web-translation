export const HEALTH_REQUEST_TYPE = 'aiwt:health-request';

export interface HealthRequest {
  type: typeof HEALTH_REQUEST_TYPE;
}

export interface HealthResponse {
  ok: true;
  version: string;
}

export function createHealthRequest(): HealthRequest {
  return { type: HEALTH_REQUEST_TYPE };
}

export function isHealthRequest(message: unknown): message is HealthRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === HEALTH_REQUEST_TYPE
  );
}

export function createHealthResponse(version: string): HealthResponse {
  return { ok: true, version };
}

export function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.ok === true && typeof record.version === 'string';
}
