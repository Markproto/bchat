/**
 * API Client — Thin fetch wrapper with JWT auth headers.
 *
 * Uses the Vite dev proxy (/api → server) in development.
 * In production, set VITE_API_URL to the server origin.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: { error: string; [k: string]: unknown },
  ) {
    super(body.error);
    this.name = 'ApiError';
  }
}

export async function api<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body);
  }

  return res.json() as Promise<T>;
}
