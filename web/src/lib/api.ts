import type { Job, JobRequest, MediaInfo } from '@shared/schemas';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly details?: string
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError("Can't reach the server.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new ApiError(
      body.error ?? `Server error ${res.status}`,
      body.details
    );
  return body as T;
}

const post = <T>(path: string, body?: unknown, signal?: AbortSignal) =>
  request<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

export const api = {
  info: (url: string, cookies: string, signal?: AbortSignal) =>
    post<MediaInfo>(
      '/api/info',
      { url, cookies: cookies || undefined },
      signal
    ),
  folders: (media: 'audio' | 'video') =>
    request<string[]>(`/api/folders?media=${media}`),
  createJob: (body: JobRequest) => post<Job>('/api/jobs', body),
  cancel: (id: string) => post(`/api/jobs/${id}/cancel`),
  retry: (id: string) => post(`/api/jobs/${id}/retry`),
  remove: (id: string) => request(`/api/jobs/${id}`, { method: 'DELETE' }),
  clearFinished: () => post('/api/jobs/clear'),
  fileUrl: (id: string) => `/api/jobs/${id}/file`,
};

/** Hands a finished job's file to the browser's download manager. */
export function saveToDevice(id: string) {
  const a = document.createElement('a');
  a.href = api.fileUrl(id);
  a.download = '';
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
}
