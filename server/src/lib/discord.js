import util from 'node:util';
import { env } from '../env.js';

/*
 * A copy of the server's logs in a Discord channel (DISCORD_WEBHOOK_URL).
 *
 *   - every console.log / warn / error line, as the terminal shows it;
 *   - every API request: method, path, status, time, who;
 *   - events in full: sign-ins, and daily check-ins with what was said.
 *
 * Lines are batched into one message every couple of seconds and sent one
 * message at a time, waiting whenever Discord asks (429), so a busy minute
 * is delayed rather than lost. Nothing here ever throws into the app, and
 * mentions are switched off so text from users cannot ping the channel.
 *
 * Only the running server sends (startDiscordLogs in index.js) — scripts that
 * import the app do not.
 */

const LIMIT = 1900; // Discord allows 2,000 characters per message
const FLUSH_MS = 2000;
const GAP_MS = 700; // between messages, under the webhook's 5 per 2 seconds
const MAX_QUEUE = 5000;
const NO_MENTIONS = { parse: [] };

const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };

let enabled = false;
let lines = '';
let flushTimer = null;
const queue = [];
let sending = false;
let dropped = 0;
let lastFailureNote = 0;

export const discordEnabled = () => enabled;

const stamp = () =>
  new Intl.DateTimeFormat('en-GB', { timeZone: env.TIMEZONE, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    .format(new Date());

/** Splits text into pieces Discord accepts, on line breaks where it can. */
function pieces(text, size = LIMIT) {
  const out = [];
  let rest = String(text);
  while (rest.length > size) {
    let cut = rest.lastIndexOf('\n', size);
    if (cut < size / 2) cut = size;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, '');
  }
  if (rest) out.push(rest);
  return out;
}

function enqueue(payload) {
  if (queue.length >= MAX_QUEUE) {
    queue.shift();
    dropped += 1;
  }
  queue.push({ allowed_mentions: NO_MENTIONS, ...payload });
  pump();
}

/** One log line, batched with the others into a code block. */
export function discordLine(line) {
  if (!enabled) return;
  const text = `${stamp()} ${String(line).replace(/```/g, "'''")}`;
  for (const part of pieces(text, LIMIT - 10)) {
    if (lines.length + part.length + 1 > LIMIT - 10) flushLines();
    lines += `${part}\n`;
  }
  if (!flushTimer) flushTimer = setTimeout(flushLines, FLUSH_MS);
}

function flushLines() {
  clearTimeout(flushTimer);
  flushTimer = null;
  if (!lines) return;
  enqueue({ content: `\`\`\`\n${lines}\`\`\`` });
  lines = '';
}

/**
 * An event in full: a coloured card with a title and fields, then any long
 * text (a transcript) as plain messages after it.
 * `fields`: [[name, value], …]; empty values are left out.
 */
export function discordEvent({ title, color = 0x2563eb, fields = [], text = '' }) {
  if (!enabled) return;
  flushLines(); // keep the order: the lines logged before this event go first
  const embedFields = fields
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .slice(0, 25)
    .map(([name, value, inline = true]) => ({ name: String(name).slice(0, 256), value: String(value).slice(0, 1024), inline }));
  enqueue({ embeds: [{ title: String(title).slice(0, 256), color, fields: embedFields, footer: { text: stamp() } }] });
  for (const part of pieces(text)) enqueue({ content: part });
}

async function pump() {
  if (sending || !queue.length) return;
  sending = true;
  try {
    while (queue.length) {
      if (dropped) {
        queue.unshift({ allowed_mentions: NO_MENTIONS, content: `⚠️ ${dropped} log messages were dropped (too many to send in time).` });
        dropped = 0;
      }
      const payload = queue[0];
      let response;
      try {
        response = await fetch(env.DISCORD_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        });
      } catch (err) {
        failed(`could not reach Discord: ${err.message}`);
        await wait(5000);
        continue; // try the same message again
      }
      if (response.status === 429) {
        const body = await response.json().catch(() => ({}));
        await wait(Math.ceil((Number(body.retry_after) || 2) * 1000) + 100);
        continue;
      }
      queue.shift();
      if (!response.ok) failed(`Discord answered ${response.status}: ${(await response.text().catch(() => '')).slice(0, 200)}`);
      await wait(GAP_MS);
    }
  } finally {
    sending = false;
  }
}

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms).unref?.(); });

/** Said in the terminal only, at most once a minute, so a broken webhook cannot flood it. */
function failed(message) {
  if (Date.now() - lastFailureNote < 60_000) return;
  lastFailureNote = Date.now();
  original.warn(`[discord] ${message}`);
}

/** Starts sending: mirrors the console from now on. Does nothing without DISCORD_WEBHOOK_URL. */
export function startDiscordLogs() {
  if (!env.DISCORD_WEBHOOK_URL || enabled) return;
  enabled = true;
  for (const [level, write] of Object.entries(original)) {
    console[level] = (...args) => {
      write(...args);
      try {
        const tag = level === 'error' ? 'ERROR ' : level === 'warn' ? 'WARN ' : '';
        discordLine(`${tag}${util.format(...args)}`);
      } catch { /* a log line must never break the app */ }
    };
  }
  process.on('uncaughtException', (err) => { discordLine(`ERROR uncaught: ${err?.stack || err}`); });
  process.on('unhandledRejection', (err) => { discordLine(`ERROR unhandled rejection: ${err?.stack || err}`); });
  discordEvent({ title: '🟢 MediThink server started', color: 0x15803d, fields: [['Port', env.PORT], ['Model', env.ANALYSIS_MODEL], ['Mode', env.isProd ? 'production' : 'development']] });
}

/** Express middleware: one line per API request, once it has finished. */
export function requestLog(req, res, next) {
  if (!enabled || req.path === '/api/health') return next();
  const started = Date.now();
  res.on('finish', () => {
    const who = req.user ? `${req.user.email || req.user.username}${req.profile ? ` (profile ${req.profile.name})` : ''}` : 'signed out';
    discordLine(`[http] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms · ${who} · ${req.ip}`);
  });
  next();
}
