# Layer 1 · Split

**Job:** one uploaded PDF often holds several reports scanned together, for
example an echo, an ECG, a prescription and a lab report. This layer decides
which pages belong to which document and what kind each one is. It puts them
in order and cuts the PDF so each document has its own file.

**Model:** one call, sent the JSON's text only.
**Code:** [`server/src/lib/split.js`](../server/src/lib/split.js),
`splitDocuments` in [`analyse.js`](../server/src/lib/analyse.js), `splitPdf`
in [`pdf.js`](../server/src/lib/pdf.js), and `SPLIT_PROMPT` in
[`prompts.js`](../server/src/lib/prompts.js).

## What is sent to the model

The JSON's blocks are regrouped by page. Each page is cut to its first
1,800 characters, because the top of a page (letterhead, title, date) is what
decides where a new document starts.

```
=== Page 1 ===
[figure] NABH ACCREDITED logo
[section_header] ## S.S.HOSPITAL DELIVERING HAPPINESS ECHO CARDIOGRAM REPORT
[list] - • No regional wall motion abnormality …

=== Page 2 ===
[figure] Ultrasound image showing a cardiac chamber …
```

A PDF with only one page skips the model: it is one document.

## What the model returns

```json
{"documents":[
  {"pages":[1,2,3],"category":"echo","title":"Echo Cardiogram Report",
   "date":"04.11.2026","dateISO":"2026-11-04","facility":"S.S.HOSPITAL"},
  {"pages":[6],"category":"blood","title":"Laboratory Report",
   "date":"31.10.2026","dateISO":"2026-10-31","facility":"ANAND DIAGNOSTIC LAB"}
]}
```

The model is told:
- Continuation pages, such as ultrasound screenshots or a second page of
  results, stay with their document.
- One lab report on one date is one document.
- Two reports of the same kind on different dates are two documents.
- A date like `04.11.2026` is day first.

### The kinds

| Id | Meaning |
|---|---|
| `blood` | Lab report of blood tests (a few urine rows on the same report still count as blood) |
| `urine` | Lab report of urine tests only |
| `ecg` | ECG tracing or report |
| `echo` | Echocardiogram, with its ultrasound screenshot pages |
| `imaging` | X-ray, CT, MRI or ultrasound other than echo |
| `endoscopy` | Endoscopy or colonoscopy report |
| `prescription` | Outpatient / OPD note, case sheet or prescription |
| `other` | Anything else: discharge summary, bill, letter |

## What code checks (`cleanSplit`)

| Check | What happens if it fails |
|---|---|
| Page numbers are within the PDF | That page number is dropped |
| A page is claimed by two documents | The first document keeps it |
| A page is claimed by no document | It joins the document before it (a page with nothing recognisable is almost always a continuation); page 1 joins the next one |
| Kind is one of the ids above | It becomes `other` |
| `dateISO` is a real calendar date | It is replaced by a day-first reading of the printed date, or left empty |
| The model's reply is not valid JSON, or has no documents | The whole upload becomes **one document**, and the analysis carries on |

## Order

Documents are numbered `n = 1, 2, …` in this order:

1. **By kind**, in the order each kind first appears in the PDF.
2. **Within a kind, oldest first** by `dateISO`, so two blood reports read as
   before → after.
3. Documents with no date come after the dated ones of their kind, in page
   order.

For `mr1` the result was:

| n | Kind | Pages | Date |
|---|---|---|---|
| 1 | echo | 1–3 | 04.11.2026 |
| 2 | ecg | 4 | 04.11.2026 |
| 3 | prescription | 5 | 04/11/2026 |
| 4 | blood | 6 | 31.10.2026 |

## Cutting the PDF

`splitPdf` copies each document's pages out of `source.pdf` into
`documents/document-<n>.pdf`, served at `GET /api/reports/:id/documents/:n/file.pdf`.
If one cut fails, that document falls back to showing the whole PDF. Its
highlights still land correctly, because pages keep the upload's own numbers.

The split is saved straight away, with every document marked `analysing`, so
the screen can list the documents while Layer 2 reads them.
