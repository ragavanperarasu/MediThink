# Layer 0 · Upload and read the PDF

**Job:** take the report PDF, store it, have LandingAI ADE read it into text,
tables and page boxes, and keep that result as the base every later layer
works from.
**Model:** LandingAI ADE (document parsing). No language model yet.
**Code:** `POST /api/reports` in
[`server/src/routes/reports.js`](../server/src/routes/reports.js),
`extractWithLandingAI` in [`server/src/lib/analyse.js`](../server/src/lib/analyse.js),
[`server/src/lib/landing.js`](../server/src/lib/landing.js) (the API client), and
`readAdeDocument` in [`server/src/lib/ade.js`](../server/src/lib/ade.js).

## Inputs

| File | Required | Used for |
|---|---|---|
| Report PDF | Yes | Sent to LandingAI to be read; shown beside the results and split per document |
| SaatruAI JSON | No | If sent with the PDF, it is used instead of calling LandingAI (no ADE credits used). The upload page no longer asks for it. |

## Steps

1. **The upload (request).** The PDF must start with `%PDF-` and open in
   `pdf-lib`. Its page count is recorded. The report is saved to the profile
   in use, with status `uploaded`, and the PDF is written to
   `uploads/<reportId>/source.pdf`. If `LANDINGAI_API_KEY` is not set, the
   upload is refused with a message saying so.
2. **The analysis starts** in the background (`startAnalysis` flips the status
   to `analysing` in one atomic step, so two clicks cannot start two runs).
3. **LandingAI reads the PDF** (progress stage `extracting`, 0–100%). A parse
   *job* is used, so a long scan does not hold a request open:

   ```
   POST {LANDINGAI_BASE_URL}/v1/ade/parse/jobs     document=<pdf>, model=dpt-2-latest
   GET  {LANDINGAI_BASE_URL}/v1/ade/parse/jobs/{id} every 3 s → status, progress, data | output_url
   ```

   Authorization is `Bearer <LANDINGAI_API_KEY>`. A result over 1 MB comes back
   as a short-lived `output_url`, which is downloaded. The job gives up after
   `LANDINGAI_TIMEOUT_MS` (20 minutes by default).
4. **The raw result is kept twice**, exactly as LandingAI returned it:
   - in MongoDB, collection `adeparses` (one per report: job id, model, page
     count, credits used, and the full `response`). If the response would pass
     MongoDB's 16 MB limit, only the per-cell `grounding` map is left out and
     `trimmed` is set;
   - on disk as `uploads/<reportId>/source.json` (always complete). The
     report's ⋮ menu → **Download JSON** returns this file.
5. **The result is normalised** (`readAdeDocument`). Each ADE chunk becomes:

   | Field | Meaning |
   |---|---|
   | `ref` | `C1`, `C2`, … in reading order. This is the name the model sees and cites. |
   | `page` | Page index, starting at 0. |
   | `type` | `text`, `table`, `figure`, `marginalia`, … |
   | `text` | The chunk's text, at most 20,000 characters. ADE's `<a id>` anchors are removed and its HTML tables become one `cell \| cell` line per row, which the model and the evidence check both read more reliably. |
   | `box` | Where it is on the page, as fractions 0–1: `{ l, t, r, b }`. |
   | `rows` | Per-row boxes for tables, built from ADE's `grounding` map (each table cell's box, row and chunk id). These let a single result be highlighted rather than the whole table. |

6. **Size limit.** The text and chunks stored on the report must stay under
   12 MB. Each upload may be at most `MAX_UPLOAD_MB` (40 MB by default).
7. **Then Layer 1 begins.** A re-analysis reuses what LandingAI already read
   and is not charged again; only an upload whose reading failed is sent to
   LandingAI again.

## Settings (`server/.env`)

| Key | Default | |
|---|---|---|
| `LANDINGAI_API_KEY` | — | Required. From https://va.landing.ai/settings/api-key |
| `LANDINGAI_BASE_URL` | `https://api.va.landing.ai` | EU accounts: `https://api.va.eu-west-1.landing.ai` |
| `LANDINGAI_MODEL` | `dpt-2-latest` | The ADE parsing model |
| `LANDINGAI_TIMEOUT_MS` | 1200000 | How long to wait for one PDF |

## Errors the user can see

| Message starts with | Cause |
|---|---|
| "Attach the report PDF" / "That file is not a PDF" | Wrong or missing file |
| "LANDINGAI_API_KEY is not set" | No key in `server/.env` |
| "LandingAI did not accept the API key" | Wrong key (HTTP 401) |
| "The LandingAI account has run out of credits" | HTTP 402 |
| "LandingAI is rate-limiting requests" | HTTP 429 — re-analyse after a minute |
| "LandingAI could not read this PDF: …" | The job failed; LandingAI's reason follows |
| "No text could be read from this PDF" | Blank or unreadable pages |

## Privacy

The PDF goes to LandingAI to be read. After that, only the text LandingAI
returned is sent to the analysis model; the PDF itself is never sent there.
