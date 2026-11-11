# Layer 4 · Ask

**Job:** answer questions about an upload, from that upload only, with every
figure linked back to its page.

**Model:** one call per question.
**Code:** `answerQuestion` in [`analyse.js`](../server/src/lib/analyse.js),
`bundleForModel` in [`ade.js`](../server/src/lib/ade.js), `QA_PROMPT` in
[`prompts.js`](../server/src/lib/prompts.js), and `POST /api/reports/:id/ask`
in [`reports.js`](../server/src/routes/reports.js).

## What is sent with each question

| # | Message | Content |
|---|---|---|
| 1 | System: rules | `QA_PROMPT`: answer only from the document; say "That is not in this report" rather than guess; copy figures exactly; cite every figure as `[C12]`; explain, never diagnose or recommend treatment |
| 2 | System: the upload | Every document's blocks, each document under a heading such as `=== Document 4: Laboratory Report · 31.10.2026 · pages 6 ===`, followed by Layer 3's computed changes, marked *"use these figures; never recalculate them"* |
| 3 | The thread | The last 12 messages, i.e. 6 questions with their answers |
| 4 | The question | |

The text is resent in full with every question; there is no search step. At
most 200,000 characters are sent. Anything beyond that is cut, with a note
saying so. `mr1` is about 9,700 characters, around 2,400 tokens.

Not sent: the PDF, images, the summaries, or the results tables.

## Memory

- **One thread per upload**, stored in MongoDB on the report (`messages[]`).
  The same thread shows on every document page of that upload. It survives
  reloads and restarts.
- **The model sees the last 6 exchanges.** Older ones are still stored and
  shown, but not sent.
- **Clearing** deletes the whole thread (`DELETE /api/reports/:id/messages`).
- New turns are added with `$push`, so two questions sent close together
  cannot overwrite each other.

## Citations

The answer's `[C83]` tags become **p.6** pins on screen. Clicking one opens the
document that holds block C83 and highlights the block on its PDF, even when
the question was asked from a different document's page.
