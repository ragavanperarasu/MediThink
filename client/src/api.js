/*
 * The API client. Same origin in development (Vite proxies /api) and in
 * production (the server serves this build), so the httpOnly session cookie
 * is all the authentication there is — nothing to store, nothing to attach.
 */

/** Raised when the server says the session is gone; AuthContext listens. */
export const UNAUTHORIZED_EVENT = 'medithink:unauthorized';

async function asError(response) {
  const body = await response.json().catch(() => ({}));
  const error = new Error(body.error || `Request failed (${response.status})`);
  error.status = response.status;
  return error;
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw await asError(response);
  }
  return response.json();
}

/* ── auth ────────────────────────────────────────────────────────────── */

export const login = (username, password) =>
  request('/api/auth/login', { method: 'POST', body: { username, password } }).then((r) => r.user);

export const logout = () => request('/api/auth/logout', { method: 'POST' });

/** The signed-in user, or null. Never throws. */
export const fetchMe = () =>
  request('/api/auth/me').then((r) => r.user).catch(() => null);

/* ── reports ─────────────────────────────────────────────────────────── */

export const listReports = (params = {}, signal) => {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== '' && value !== null),
  ).toString();
  return request(`/api/reports${query ? `?${query}` : ''}`, { signal }).then((r) => r.reports);
};

export const fetchStats = (signal) => request('/api/reports/stats', { signal });

export const fetchReport = (id, signal) => request(`/api/reports/${id}`, { signal }).then((r) => r.report);

export const fetchStatus = (id, signal) => request(`/api/reports/${id}/status`, { signal });

export const updateReport = (id, changes) =>
  request(`/api/reports/${id}`, { method: 'PATCH', body: changes }).then((r) => r.report);

export const reanalyse = (id) => request(`/api/reports/${id}/analyse`, { method: 'POST' });

export const ask = (id, question) =>
  request(`/api/reports/${id}/ask`, { method: 'POST', body: { question } }).then((r) => r.messages);

export const clearThread = (id) => request(`/api/reports/${id}/messages`, { method: 'DELETE' });

export const deleteReport = (id) => request(`/api/reports/${id}`, { method: 'DELETE' });

export const pdfUrl = (id) => `/api/reports/${id}/file.pdf`;
/** One document's own pages, split from the upload. */
export const documentPdfUrl = (id, n) => `/api/reports/${id}/documents/${n}/file.pdf`;
export const jsonUrl = (id) => `/api/reports/${id}/source.json`;

/**
 * Uploads the export and its annotated PDF — both required. XHR rather than
 * fetch, because fetch still cannot report upload progress and a 30 MB PDF
 * deserves a bar.
 */
export function uploadReport({ json, pdf, title }, onProgress) {
  const form = new FormData();
  form.append('json', json);
  form.append('pdf', pdf);
  if (title) form.append('title', title);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/reports');
    xhr.withCredentials = true;
    xhr.responseType = 'json';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      const body = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body.report);
      if (xhr.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      const error = new Error(body.error || `Upload failed (${xhr.status})`);
      error.status = xhr.status;
      return reject(error);
    };
    xhr.onerror = () => reject(new Error('The upload could not reach the server. Check that it is running.'));
    xhr.send(form);
  });
}
