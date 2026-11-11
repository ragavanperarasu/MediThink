# MediThink

**Medical reports, read with evidence.**

MediThink reads the JSON that [SaatruAI](../../ReactJs/ADE) extracts from a medical
report. It flags results that fall outside the report's own reference ranges and
writes a plain-language summary. It also answers questions about the report, and
every figure in an answer links back to the line on the page it came from.

MediThink does no document parsing of its own. SaatruAI turns the PDF into text,
tables and boxes, and MediThink reads that.

React + Material UI frontend, Node + Express backend, MongoDB.

## Which file to upload

| File | Role | Required |
| --- | --- | --- |
| **SaatruAI JSON** (Download → JSON) | **What is read.** It holds the text, tables, reading order and a box for every block. Only this text is sent to the model. | Yes |
| **Annotated PDF** (Download → Annotated PDF) | **What is shown.** Never read and never sent to the model. Its page count must match the JSON, since every box is placed by page. It is cut into one PDF per document and drawn beside the results. | Yes |

One PDF may hold several reports (an echo, an ECG, a prescription and a lab
report scanned together). MediThink splits it into separate documents first.

## Quick start

Needs Node 20.15+ and a running MongoDB (the local Homebrew one is fine).

```bash
# 1. API — terminal one
cd server
npm install
# Edit server/.env: paste your OpenAI key into OPENAI_API_KEY
npm run dev                 # http://localhost:4100

# 2. Web app — terminal two
cd client
npm install
npm run dev                 # http://localhost:5180
```

Open <http://localhost:5180> and sign in:

| Username | Password |
| --- | --- |
| `admin` | `admin@1234` |

The admin account is written to MongoDB from `server/.env` at every boot. To
change the password, edit `ADMIN_PASSWORD` and restart the API.

## Configuration — `server/.env`

| Variable | Default | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/medithink` | Database for the admin account and reports. |
| `JWT_SECRET` | — | Signs the session cookie. 32+ characters; required in production. |
| `OPENAI_API_KEY` | — | Needed to analyse reports. Without it, uploads work but the analysis fails with a clear message. |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin@1234` | The sign-in account. |
| `ANALYSIS_MODEL` | `gpt-5.6-luna` | The model that reads reports and answers questions. |
| `ANALYSIS_TIMEOUT_MS` | `120000` | Per model call. |
| `PORT` | `4100` | API port. |
| `STORAGE_DIR` | `./uploads` | Where uploaded JSON and PDF files are kept, one folder per report. |
| `MAX_UPLOAD_MB` | `40` | Per file. |
| `TIMEZONE` | `Asia/Kolkata` | How the dashboard groups uploads by day. |
| `TRUST_PROXY` | `0` | Reverse proxies in front of the API, for correct rate limits. |
| `NODE_ENV` | — | `production` serves the built client and enforces a real `JWT_SECRET`. |

The client reads `VITE_SAATRU_URL` (default `http://localhost:5173`) for its
"Open SaatruAI" links.

## How a report is read

The full walkthrough, one page per layer, is in [`docs/`](docs/README.md).

1. **Upload.** The export is checked, normalized to blocks `C1, C2, …` (each with
   its page and box) and stored. The PDF must have the same number of pages as
   the JSON. Both files are written to `uploads/<reportId>/`.
2. **Split (layer one).** The JSON's text, page by page, goes to the model,
   which returns which pages form which document and what kind each is
   (`blood`, `urine`, `ecg`, `echo`, `prescription`, `imaging`, `endoscopy`,
   `other`). Every page is placed in exactly one document. Documents are
   grouped by kind and ordered oldest → newest by printed date within a kind.
   The PDF is cut to match: `uploads/<reportId>/documents/document-<n>.pdf`.
3. **Analyse each document** (in the background, up to three at a time). Two model calls per document run together:
   - **Values and details.** Every measured result, with the reference range as
     printed and a flag (`low`, `high`, `abnormal`, `normal` or `unknown`), plus
     the patient name, date and lab.
   - **Summary.** Plain language, citing blocks as `[C4]`.
4. **Evidence check.** Each value is looked up in the block the model cited. If
   it is not there, every block is searched for the test name and reading
   together. When SaatruAI has per-cell boxes, the highlight narrows to the
   **table row**. A value that can't be found is kept but marked **unverified**,
   so the reader knows which figure to check on the page.
5. **Compare** (when the upload has two or more documents of one kind). Code
   lines up the same test by exact name; the model is asked only to pair the
   names left over ("FBS" ↔ "Fasting Blood Sugar"), and code checks every pair
   (one per report, same kind of value, no conflicting units). Every
   difference and percentage is computed in code, only when both values are
   plain numbers in the same unit and both were found in the report text.
   A short written explanation is generated from the computed table and
   discarded if it contains any number not in that table. See
   [`server/src/lib/compare.js`](server/src/lib/compare.js).
6. **Ask.** Questions are answered from the whole upload (every document), with
   citations. The computed changes are sent with each question, so answers
   about change use them instead of recalculating.
   MediThink explains; it does not diagnose or recommend treatment.

The prompts are in [`server/src/lib/prompts.js`](server/src/lib/prompts.js).
Their rules come from the Medical project's lab-report prompts: copy figures
exactly, never supply a reference range, and say "not in this report" rather
than guess.

> Report text is sent to OpenAI for analysis, as in the Medical project.

## API

All routes except `/api/health` and `/api/auth/*` need the session cookie.

| Method | Path | |
| --- | --- | --- |
| `POST` | `/api/auth/login` | `{ username, password }` → sets the cookie |
| `POST` | `/api/auth/logout` | |
| `GET` | `/api/auth/me` | `{ user }` or `{ user: null }` |
| `POST` | `/api/reports` | multipart: `json` and `pdf` (both required), `title` — starts the split and analysis |
| `GET` | `/api/reports?q=&type=&flagged=1` | the library |
| `GET` | `/api/reports/stats` | dashboard totals, type mix, 14-day activity |
| `GET` | `/api/reports/:id` | full report: summary, values, blocks, thread |
| `GET` | `/api/reports/:id/status` | polled while analysing |
| `GET` | `/api/reports/:id/file.pdf` | the uploaded PDF |
| `GET` | `/api/reports/:id/documents/:n/file.pdf` | one document's pages, split from the upload |
| `GET` | `/api/reports/:id/source.json` | the uploaded export |
| `PATCH` | `/api/reports/:id` | `{ title?, reportType? }` |
| `POST` | `/api/reports/:id/analyse` | re-run (202; ignored if one is already running) |
| `POST` | `/api/reports/:id/ask` | `{ question }` |
| `DELETE` | `/api/reports/:id/messages` | clear the conversation |
| `DELETE` | `/api/reports/:id` | delete the report and its files |

## Production

```bash
cd client && npm run build
cd ../server && NODE_ENV=production npm start   # serves the API and the built app on PORT
```

Put it behind HTTPS: in production the session cookie is `Secure`.

## Brand

The mark is a report page with its corner turned down. A pulse trace across it
spells the **M** and ends on a dot, the point being read. It uses SaatruAI's
cyan → blue → indigo gradient, so the two products sit together.

| File | Use |
| --- | --- |
| [`client/src/brand/Logo.jsx`](client/src/brand/Logo.jsx) | `<Logo />`, `<MediThinkMark />`, `<Wordmark />` |
| [`client/src/brand/mark.svg`](client/src/brand/mark.svg) | The mark as a standalone SVG |
| `client/public/favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` | Browser and home-screen icons |

The wordmark is **MediThink**, set in Comfortaa 700: "Medi" in navy `#12235c`
and "Think" in blue `#2f7cf7`.
