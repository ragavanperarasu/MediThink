import { env } from '../env.js';

/*
 * LandingAI ADE (Agentic Document Extraction): the PDF goes in, and comes back
 * as reading-order Markdown plus typed chunks, each grounded to a box on its
 * page — the same shape lib/ade.js already reads.
 *
 * Parse *jobs* are used rather than the one-shot parse: a long scanned upload
 * can take minutes, and a job is polled instead of holding one request open.
 *   POST {base}/v1/ade/parse/jobs          → { job_id }
 *   GET  {base}/v1/ade/parse/jobs/{job_id} → { status, progress, data | output_url, failure_reason }
 */

const POLL_MS = 3000;

export const LANDINGAI_MISSING =
  'LANDINGAI_API_KEY is not set in server/.env, so PDFs cannot be read yet. Add the key and restart the server.';

export class LandingError extends Error {}

/** A plain message for each way the API says no. */
async function failure(response, during) {
  let detail = '';
  try {
    const body = await response.json();
    detail = String(body?.detail?.[0]?.msg ?? body?.detail ?? body?.message ?? body?.error ?? '').slice(0, 300);
  } catch { /* not JSON */ }
  const reasons = {
    401: 'LandingAI did not accept the API key. Check LANDINGAI_API_KEY in server/.env.',
    402: 'The LandingAI account has run out of credits.',
    403: 'LandingAI refused this request for the API key in use.',
    413: 'The PDF is too large for LandingAI.',
    422: `LandingAI could not read this file${detail ? `: ${detail}` : '.'}`,
    429: 'LandingAI is rate-limiting requests. Wait a minute and re-analyse.',
  };
  return new LandingError(reasons[response.status] ?? `LandingAI ${during} failed (${response.status})${detail ? `: ${detail}` : '.'}`);
}

const headers = () => ({ Authorization: `Bearer ${env.LANDINGAI_API_KEY}` });

/**
 * Parses one PDF. `onProgress(fraction)` is called while LandingAI works.
 * Resolves to the ADE parse response: { markdown, chunks, splits, grounding, metadata }.
 */
export async function parseWithLandingAI(pdf, filename, { onProgress } = {}) {
  if (!env.LANDINGAI_API_KEY) throw new LandingError(LANDINGAI_MISSING);

  const form = new FormData();
  form.append('document', new Blob([pdf], { type: 'application/pdf' }), filename || 'report.pdf');
  form.append('model', env.LANDINGAI_MODEL);

  const created = await fetch(`${env.LANDINGAI_BASE_URL}/v1/ade/parse/jobs`, { method: 'POST', headers: headers(), body: form });
  if (!created.ok) throw await failure(created, 'upload');
  const { job_id: jobId } = await created.json();
  if (!jobId) throw new LandingError('LandingAI did not return a job id.');

  const deadline = Date.now() + env.LANDINGAI_TIMEOUT_MS;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const polled = await fetch(`${env.LANDINGAI_BASE_URL}/v1/ade/parse/jobs/${encodeURIComponent(jobId)}`, { headers: headers() });
    if (!polled.ok && polled.status !== 206) throw await failure(polled, 'job check');
    const job = await polled.json();
    const status = String(job.status ?? '').toLowerCase();

    if (typeof job.progress === 'number') onProgress?.(Math.max(0, Math.min(1, job.progress)));

    if (status === 'completed' || status === 'succeeded' || status === 'success') {
      let result = job.data;
      // Large results come as a short-lived download link instead of inline.
      if (!result && job.output_url) {
        const out = await fetch(job.output_url);
        if (!out.ok) throw new LandingError(`LandingAI's result could not be downloaded (${out.status}).`);
        result = await out.json();
      }
      if (!result || (!Array.isArray(result.chunks) && typeof result.markdown !== 'string')) {
        throw new LandingError('LandingAI finished but returned no readable result.');
      }
      return { jobId, result };
    }
    if (job.failure_reason || ['failed', 'failure', 'error', 'cancelled', 'canceled'].includes(status)) {
      throw new LandingError(`LandingAI could not read this PDF: ${job.failure_reason || status}.`);
    }
    if (Date.now() > deadline) {
      throw new LandingError(`LandingAI took longer than ${Math.round(env.LANDINGAI_TIMEOUT_MS / 60000)} minutes. Re-analyse to try again.`);
    }
  }
}
