/*
 * The API client. Same origin by default in development (Vite proxies /api) and in
 * production (the server serves this build), so the httpOnly session cookie
 * is all the authentication there is — nothing to store, nothing to attach.
 */

/*
 * The API's address, from VITE_API_BASE_URL in client/.env. Empty means the
 * same address as the app (the usual case). When it is another address, the
 * session cookie has to be sent cross-origin, so requests include credentials.
 */
export const API_BASE = String(import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
export const CREDENTIALS = API_BASE ? 'include' : 'same-origin';
/** A full API URL: apiUrl('/api/reports') → '<base>/api/reports'. */
export const apiUrl = (path) => `${API_BASE}${path}`;

/** Raised when the server says the session is gone; AuthContext listens. */
export const UNAUTHORIZED_EVENT = 'medithink:unauthorized';
/** Raised when the server needs a profile chosen first; AuthContext listens. */
export const PROFILE_REQUIRED_EVENT = 'medithink:profile-required';

async function asError(response) {
  const body = await response.json().catch(() => ({}));
  const error = new Error(body.error || `Request failed (${response.status})`);
  error.status = response.status;
  return error;
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch(apiUrl(path), {
    method,
    credentials: CREDENTIALS,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!response.ok) throw await failed(path, response);
  return response.json();
}

/** The error for a failed response, after telling the app about a lost session or a missing profile. */
async function failed(path, response) {
  if (response.status === 401 && !path.startsWith('/api/auth/')) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  if (response.status === 428) window.dispatchEvent(new Event(PROFILE_REQUIRED_EVENT));
  return asError(response);
}

/* ── auth ────────────────────────────────────────────────────────────── */

/*
 * A session is { user, profile, profiles }: the account, the profile (person)
 * in use — null until one is chosen when there are several — and all of the
 * account's profiles.
 */

export const logout = () => request('/api/auth/logout', { method: 'POST' });

/** { googleClientId } — null when "Continue with Google" is not set up. */
export const fetchAuthConfig = () => request('/api/auth/config').catch(() => ({ googleClientId: null }));

/** Signs in (or up) with the ID token from Google's button. */
export const googleSignIn = (credential) =>
  request('/api/auth/google', { method: 'POST', body: { credential } });

/** The session, or an empty one. Never throws. */
export const fetchMe = () =>
  request('/api/auth/me').catch(() => ({ user: null, profile: null, profiles: [] }));

/* ── profiles ────────────────────────────────────────────────────────── */

/** Each with its reportCount. */
export const listProfiles = () => request('/api/profiles');

export const createProfile = (fields) =>
  request('/api/profiles', { method: 'POST', body: fields }).then((r) => r.profile);

export const updateProfile = (id, fields) =>
  request(`/api/profiles/${id}`, { method: 'PATCH', body: fields }).then((r) => r.profile);

export const selectProfile = (id) =>
  request(`/api/profiles/${id}/select`, { method: 'POST' }).then((r) => r.profile);

export const deleteProfile = (id) => request(`/api/profiles/${id}`, { method: 'DELETE' });

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

/*
 * The Assistant. A scope is "all", "type:<kind>" or "doc:<uploadId>:<n>";
 * each has its own thread per profile.
 */
export const fetchThread = (scope, signal) => request(`/api/ask?scope=${encodeURIComponent(scope)}`, { signal });

/**
 * Asks one question; the answer streams in as it is written. `onText` gets
 * the answer so far after every piece; `language` is the code the answer
 * is written in; `mode` "voice" asks for a short answer to read aloud.
 * Resolves with the stored question and
 * answer once it is complete.
 */
export async function ask(scope, question, onText, signal, language = 'en', mode = 'chat') {
  const path = '/api/ask';
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    credentials: CREDENTIALS,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope, question, language, mode }),
    signal,
  });
  if (!response.ok) throw await failed(path, response);

  // One JSON event per line: delta · done · error.
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (!line) continue;
      const event = JSON.parse(line);
      if (event.type === 'delta') {
        answer += event.text;
        onText?.(answer);
      } else if (event.type === 'done') {
        return event.messages;
      } else if (event.type === 'error') {
        throw new Error(event.error);
      }
    }
  }
  throw new Error('The answer was cut off. Ask again.');
}

export const clearThread = (scope) => request(`/api/ask?scope=${encodeURIComponent(scope)}`, { method: 'DELETE' });

export const deleteReport = (id) => request(`/api/reports/${id}`, { method: 'DELETE' });

export const pdfUrl = (id) => apiUrl(`/api/reports/${id}/file.pdf`);
/** One document's own pages, split from the upload. */
export const documentPdfUrl = (id, n) => apiUrl(`/api/reports/${id}/documents/${n}/file.pdf`);
export const jsonUrl = (id) => apiUrl(`/api/reports/${id}/source.json`);

/**
 * Uploads the export and its annotated PDF — both required. XHR rather than
 * fetch, because fetch still cannot report upload progress and a 30 MB PDF
 * deserves a bar.
 */
export function uploadReport({ json, pdf, title }, onProgress) {
  const form = new FormData();
  // The PDF alone is read by LandingAI ADE on the server; a JSON export is optional.
  if (json) form.append('json', json);
  form.append('pdf', pdf);
  if (title) form.append('title', title);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl('/api/reports'));
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
