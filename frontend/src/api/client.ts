const BASE = import.meta.env.VITE_API_URL || '';

const TOKEN_KEY = 'gambling-hub.token';

export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  clear: (): void => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Attach the bearer token. Defaults to true. */
  auth?: boolean;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  /**
   * A FormData body must NOT get a Content-Type header. The browser sets it
   * itself, including the multipart boundary it generated — writing our own
   * `multipart/form-data` here would omit that boundary and the server would
   * fail to parse the upload.
   */
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;

  const headers: Record<string, string> = {};
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

  if (auth) {
    const token = tokenStore.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: isForm ? (body as FormData) : JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    // A dead session should not linger — clear it so the UI drops back to the
    // "Connect Wallet" state instead of looping on 401s.
    if (res.status === 401) tokenStore.clear();
    throw new ApiError(res.status, err?.code ?? 'UNKNOWN', err?.message ?? 'Request failed.');
  }

  return data as T;
}
