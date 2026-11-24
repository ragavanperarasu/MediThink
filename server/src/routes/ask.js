import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import Conversation from '../models/Conversation.js';
import { completeStream } from '../lib/analyse.js';
import { askMessages, liveInstructions, parseScope, resolveScope, threadPayload } from '../lib/ask.js';
import { languageOf } from '../lib/languages.js';
import { HttpError, wrap } from '../lib/http.js';
import { assertLive, offerFrom, startLiveSession } from '../lib/live.js';

/*
 * The Assistant. A thread per scope — all reports, one kind of report, or one
 * report — kept per profile. See lib/ask.js for what each scope answers from.
 */
const router = Router();

const own = (req) => ({ account: req.user._id, profile: req.profile._id });

const modelLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests in a minute. Wait a moment and try again.' },
});

/** GET /api/ask?scope=… — the thread, and what its citations point at. */
router.get(
  '/',
  wrap(async (req, res) => {
    const resolved = await resolveScope(own(req), parseScope(req.query.scope));
    const thread = await Conversation.findOne({ profile: req.profile._id, scope: resolved.scope }, { messages: 1 }).lean();
    res.json(threadPayload(resolved, thread?.messages ?? []));
  }),
);

/**
 * POST /api/ask { scope, question, language, mode? } — answers one question,
 * streamed as it is written; mode "voice" asks for a short spoken answer.
 * The body is one JSON object per line:
 *   {"type":"delta","text":"…"}    the next piece of the answer
 *   {"type":"done","messages":[…]} the question and answer, now stored
 *   {"type":"error","error":"…"}   it failed part-way; nothing was stored
 * A request refused before answering (no question, unknown scope, too many
 * requests) is an ordinary JSON error with its status code.
 */
router.post(
  '/',
  modelLimiter,
  wrap(async (req, res) => {
    const question = String(req.body?.question ?? '').trim();
    if (!question) throw new HttpError(400, 'Type a question first.');
    if (question.length > 2000) throw new HttpError(400, 'That question is too long — keep it under 2,000 characters.');

    const resolved = await resolveScope(own(req), parseScope(req.body?.scope));
    const thread = await Conversation.findOne({ profile: req.profile._id, scope: resolved.scope }, { messages: 1 }).lean();
    const prompt = askMessages(resolved, thread?.messages ?? [], question, languageOf(req.body?.language), { voice: req.body?.mode === 'voice' });

    res.status(200).set({
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const send = (event) => res.write(`${JSON.stringify(event)}\n`);

    // Closing the page stops the model and stores nothing.
    const controller = new AbortController();
    let finished = false;
    res.on('close', () => { if (!finished) controller.abort(); });

    try {
      const answer = await completeStream(prompt, (text) => send({ type: 'delta', text }), { signal: controller.signal });
      if (!answer) throw new Error('the model returned an empty answer');
      const turns = [
        { role: 'user', content: question, at: new Date() },
        { role: 'assistant', content: answer, at: new Date() },
      ];
      // $push rather than save(), so two questions sent close together both land.
      await Conversation.updateOne(
        { profile: req.profile._id, scope: resolved.scope },
        { $setOnInsert: { account: req.user._id }, $push: { messages: { $each: turns } } },
        { upsert: true },
      );
      finished = true;
      send({ type: 'done', messages: turns });
    } catch (err) {
      finished = true;
      if (!controller.signal.aborted) send({ type: 'error', error: `Could not answer that: ${err?.message || 'the model did not respond'}. Ask again.` });
    }
    res.end();
  }),
);

/** POST /api/ask/live { scope, language, sdp } → { sdp, sessionId } — a GPT-Live voice conversation (lib/live.js). */
router.post(
  '/live',
  modelLimiter,
  wrap(async (req, res) => {
    assertLive();
    const sdp = offerFrom(req.body);
    const resolved = await resolveScope(own(req), parseScope(req.body?.scope));
    const instructions = liveInstructions(resolved, languageOf(req.body?.language));
    res.json(await startLiveSession({ sdp, instructions, userId: req.user._id }));
  }),
);

/**
 * POST /api/ask/live/turns { scope, turns: [{ role, content }] } — what was
 * said in a voice conversation, as the browser heard it transcribed, added to
 * the chat thread when the conversation ends.
 */
router.post(
  '/live/turns',
  wrap(async (req, res) => {
    const resolved = await resolveScope(own(req), parseScope(req.body?.scope));
    const turns = (Array.isArray(req.body?.turns) ? req.body.turns : [])
      .slice(0, 200)
      .map((t) => ({
        role: t?.role === 'assistant' || t?.role === 'user' ? t.role : null,
        content: String(t?.content ?? '').trim().slice(0, 4000),
        at: new Date(),
      }))
      .filter((t) => t.role && t.content);
    if (turns.length) {
      await Conversation.updateOne(
        { profile: req.profile._id, scope: resolved.scope },
        { $setOnInsert: { account: req.user._id }, $push: { messages: { $each: turns } } },
        { upsert: true },
      );
    }
    res.json({ messages: turns });
  }),
);

/** DELETE /api/ask?scope=… — clears that thread. */
router.delete(
  '/',
  wrap(async (req, res) => {
    const { scope } = parseScope(req.query.scope);
    await Conversation.deleteOne({ profile: req.profile._id, scope });
    res.json({ ok: true });
  }),
);

export default router;
