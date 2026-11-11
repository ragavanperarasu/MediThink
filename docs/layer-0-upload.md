# Layer 0 · Upload

**Job:** accept the two files, refuse a wrong pair, and store a clean copy
that every later layer can trust.
**Model:** none.
**Code:** `POST /api/reports` in
[`server/src/routes/reports.js`](../server/src/routes/reports.js), and
`readAdeDocument` in [`server/src/lib/ade.js`](../server/src/lib/ade.js).

## Inputs

| File | From SaatruAI | Required | Used for |
|---|---|---|---|
| JSON | Download → JSON | Yes | Everything that is read: text, tables, reading order and a box for every block |
| Annotated PDF | Download → Annotated PDF | Yes | Only showing pages and splitting them; never read for text |

## Steps

1. **Both files must be present.** A missing JSON or PDF is refused with a
   message that says which one.
2. **The JSON must be a SaatruAI export.** It is unwrapped from `{ document }`,
   `{ result }` or `{ data }` if needed. It must have `chunks` or
   `markdown`, and it must contain some text. A scanned PDF parsed without
   OCR is refused with "start the OCR engine in SaatruAI".
3. **The PDF must be a PDF.** The file must start with `%PDF-`, and
   `pdf-lib` must be able to open it.
4. **The page counts must match.** The PDF's page count must equal the JSON's
   `pageCount`. Every box in the JSON is placed by page number, so a
   different PDF would put every highlight in the wrong place. The upload page
   checks this in the browser too, before sending anything.
5. **The blocks are normalised.** Each SaatruAI chunk becomes:

   | Field | Meaning |
   |---|---|
   | `ref` | `C1`, `C2`, … in reading order. This is the name the model sees and cites. |
   | `page` | Page index, starting at 0. |
   | `type` | `text`, `table`, `key_value`, `figure`, … |
   | `text` | The block's Markdown, at most 20,000 characters. |
   | `box` | Where it is on the page, as fractions 0–1: `{ l, t, r, b }`. Both SaatruAI's and LandingAI's spellings are read. |
   | `rows` | Per-row boxes for tables, when SaatruAI exported per-cell boxes. These let a single result be highlighted rather than the whole table. |

   Chunks are sorted by SaatruAI's `order` when every chunk has one.
6. **Size limit.** The text and blocks together must stay under 12 MB, so the
   record fits in MongoDB. Each file may be at most `MAX_UPLOAD_MB` (40 MB by
   default).
7. **Files first, record second.** Both files are written to
   `uploads/<reportId>/`, then the record is saved. If saving fails, the files
   are removed. A record never points at files that don't exist.
8. **The analysis starts.** It runs in the background. `startAnalysis` flips
   the status to `analysing` in one atomic step, so pressing the button twice
   cannot start two runs.

## Errors the user can see

| Message starts with | Cause |
|---|---|
| "Attach the JSON export…" / "Attach the annotated PDF…" | A file is missing |
| "That JSON is not a SaatruAI export" | Wrong JSON |
| "This export has no text in it" | Scanned PDF parsed without OCR |
| "The PDF has N pages but the JSON describes M" | The PDF and JSON come from different documents |
| "Each file can be at most … MB" | File too large |
