# How MediThink reads a report

MediThink takes a **report PDF**. LandingAI ADE reads it into text, tables and
page boxes, and MediThink turns that into separate documents. For each document it produces a
plain-language summary and a table of results checked against the page. Where
there are several reports of one kind, it shows how the results changed. It
can also answer questions about all of this.

The work runs in layers. Each layer has one job. Each one's output is checked
in code before the next layer uses it.

```
 Report PDF ──────► Layer 0  Upload + read  store the PDF; LandingAI ADE reads it   (ADE)
                         │              raw JSON kept in MongoDB + source.json
                         ▼
                    Layer 1  Split        which pages form which document       (1 model call)
                         │                + cut the PDF into one file each
                         ▼
                    Layer 2  Read         per document: results + summary       (2 calls per document)
                         │                + evidence check of every value
                         ▼
                    Layer 3  Compare      same test across reports of a kind    (0–2 calls per kind)
                         │                every difference computed in code
                         ▼
                    Finish                roll-up for the library, status ready (no model)

                    Layer 4  Ask          questions, any time after             (1 call per question)
```

| Layer | Job | Model used for | Code checks | Details |
|---|---|---|---|---|
| 0 · Upload + read | Store the PDF; LandingAI ADE reads it into text, tables and boxes | LandingAI ADE (parsing, not a language model) | PDF header; ADE job status; result shape and size | [layer-0-upload.md](layer-0-upload.md) |
| 1 · Split | Find the separate documents inside one PDF and order them | Grouping pages and naming each document's kind, title and date | Every page in exactly one document, known kinds only, real dates | [layer-1-split.md](layer-1-split.md) |
| 2 · Read | Results and summary for each document | Reading values and writing the summary | Flags whitelisted; every value looked up in the text it was cited from | [layer-2-read.md](layer-2-read.md) |
| 3 · Compare | What went up or down between reports of the same kind | Pairing differently named tests; describing the computed table | Pairs validated; all arithmetic in code; description rejected if it has a number not in the table | [layer-3-compare.md](layer-3-compare.md) |
| 4 · Ask | Answer questions about all reports, one kind, or one report | Answering | Answers must cite their source; figures over time are listed by date, never recalculated | [layer-4-ask.md](layer-4-ask.md) |

How the results appear on screen: [screens.md](screens.md).

## Three rules every layer follows

1. **Only text goes to the language model.** The PDF goes to LandingAI to be
   read; after that only the text it returned is sent to the analysis model.
   The PDF is otherwise only counted, split and shown.
2. **Every figure comes from the document or from code.** The model may
   read and describe values. It never supplies a value, a reference range or
   any arithmetic of its own.
3. **A model step that fails costs less detail, never accuracy.**

   | When this fails | What happens instead |
   |---|---|
   | The split | The whole upload becomes one document. |
   | Name matching | Tests that are named differently stay as separate rows. |
   | The description of the changes | Only the table is shown. |
   | One document | It is marked failed; the others carry on. |

## Model calls for one upload

| Step | Calls |
|---|---|
| Split | 1 (none when the PDF has one page) |
| Read | 2 per document (results and summary, run together; up to 3 documents at once) |
| Compare | Per kind with 2+ documents: 1 for leftover test names, but only when there are any; 1 for the description |
| Ask | 1 per question |

Example: `mr1` (echo, ECG, prescription, lab report; no repeated kind) =
1 + 4 × 2 = **9 calls**.

The model is set by `ANALYSIS_MODEL` in `server/.env` (default `gpt-5.6-luna`),
with a time limit of `ANALYSIS_TIMEOUT_MS` per call.

## Finish: what the library shows

After Layer 3, `rollUp` in
[`server/src/lib/analyse.js`](../server/src/lib/analyse.js) writes the
summary of the upload as a whole:

| Field | Comes from |
|---|---|
| Title | One document: its own title. Several: the file name (e.g. `mr1`), shown as a folder. A title the user typed is never replaced. |
| Kinds | Every document's kind, e.g. `echo, ecg, prescription, blood`. The library's type filter matches any of them. |
| Results / flagged | Totals across the documents that were read. |
| Patient | The first document that printed a patient name. |
| Date | One date, or a range oldest → newest. Two spellings of the same day count once. |
| Hospital / lab | Every distinct facility, joined. |

The status then becomes `ready`. It becomes `failed` only if no document could
be read at all.

## Where things are stored

```
server/uploads/<reportId>/
  source.pdf                  the report PDF, as uploaded
  source.json                 LandingAI ADE's full response (also in MongoDB: adeparses)
  documents/document-1.pdf    pages of document 1 (written by Layer 1)
  documents/document-2.pdf    …
```

MongoDB, collection `reports`, one record per upload. The fields each layer
writes:

| Field | Written by | Holds |
|---|---|---|
| `chunks` | Layer 0 | The JSON's blocks `C1…Cn`, each with its page, text and box |
| `documents[]` | Layers 1 and 2 | Each document's pages, kind, date, status, summary and values |
| `comparisons[]` | Layer 3 | One computed table per kind that appears more than once |
| `messages[]` | — | Unused; Assistant threads are in the `conversations` collection (Layer 4) |
| `progress` | Every layer | `{ stage, done, total }`, polled by the page while it works |

## Code map

| File | Layer |
|---|---|
| [`server/src/routes/reports.js`](../server/src/routes/reports.js) | 0, and every API route |
| [`server/src/lib/ade.js`](../server/src/lib/ade.js) | 0 (reading the export), 2 (evidence check), 4 (text for the model) |
| [`server/src/lib/pdf.js`](../server/src/lib/pdf.js) | 0 (page count), 1 (splitting the PDF) |
| [`server/src/lib/split.js`](../server/src/lib/split.js) | 1 |
| [`server/src/lib/analyse.js`](../server/src/lib/analyse.js) | Runs layers 1–3, Finish and 4 |
| [`server/src/lib/compare.js`](../server/src/lib/compare.js) | 3 |
| [`server/src/lib/prompts.js`](../server/src/lib/prompts.js) | Every prompt, in one place |
| [`server/src/lib/reportTypes.js`](../server/src/lib/reportTypes.js) | The kinds of document and how each is described to the model |
