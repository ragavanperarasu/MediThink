# Layer 2 · Read each document

**Job:** for each document found by Layer 1, pull out every measured result
with its printed reference range and flag. Write a plain-language summary.
Then check that every value really is in the text it was said to come from.

**Model:** two calls per document, run together. Up to three documents are
read at once.
**Code:** `analyseDocument` and `cleanValue` in
[`analyse.js`](../server/src/lib/analyse.js), `locateValue` in
[`ade.js`](../server/src/lib/ade.js), and `ANALYSIS_PROMPT` /
`SUMMARY_PROMPT` in [`prompts.js`](../server/src/lib/prompts.js).

## What is sent to the model

Only the blocks on this document's pages. First comes one sentence about the
kind of document (from
[`reportTypes.js`](../server/src/lib/reportTypes.js)), then a note when it is
part of a larger upload:

```
This is an electrocardiogram (ECG) tracing: machine-printed intervals and axes …
It is page 4 of a larger upload; only this document is given.

Report:
---
[C50 · page 4 · text]
HR 94 bpm P axis 31° QRS axis 9° T axis 10° RR P PR QRS QT QFm 636 ms 100 ms …
---
```

Every block opens with a tag like `[C50 · page 4 · text]`. The model must cite
these tags, and the tags are what make each figure traceable to a box on a page.

Telling the model the kind keeps it from looking for the wrong shape. A lab
report is numbers against ranges. An echo has no ranges, and its
ultrasound-screenshot text is unreliable.

## Call 1 · Results (JSON)

```json
{"details":{"title":"","reportType":"","patientName":"","age":"","sex":"",
            "reportDate":"","facility":"","referredBy":""},
 "values":[{"name":"Fasting Glucose","value":"176.0","unit":"mg/dl",
            "range":"70 to 110","flag":"high","section":"Chemistry","source":"C83"}]}
```

Rules the model is given:
- Copy values exactly, including commas, decimals and `<` or `>`. Never round
  or convert.
- `range` is only what is printed. It is never filled in from medical
  knowledge.
- `flag`:
  - Use the report's own H/L/* mark when it prints one.
  - Otherwise use `low` or `high` only by comparing a number with a printed
    numeric range.
  - `abnormal` is for a qualitative mismatch, e.g. "Positive" against "Negative".
  - Anything unsure is `unknown`.
- Exclude names, dates, IDs, doctors and free text. A narrative report (echo,
  imaging) may have no values at all.

## Call 2 · Summary (Markdown)

The summary uses exactly three headings:
- **What this report is**
- **What stands out**: results outside their range, with the printed range
- **Everything else**: the rest, grouped as the report groups it

Every figure is cited, e.g. `[C83]`. Abbreviations are expanded the first
time. There is no diagnosis, no treatment and no reassurance the document
doesn't support.

## What code checks

**Each row (`cleanValue`):**
- Rows without a name or value are dropped.
- Every field is length-limited.
- A flag outside `low / high / abnormal / normal / unknown` becomes `unknown`.
  A wrong flag would be drawn as a colour that states a clinical fact.

**Evidence check (`locateValue`), for every value:**

1. Both the value and the block text are compared lowercase, without spaces
   or thousands separators. So `1,23,000` matches `123000`.
2. Look in the block the model cited. Is the value printed there?
3. If not, look for a block on this document's pages that holds **both** the
   test name and the value.
4. If found, `verified = true`, and the value gets that block's page and box.
   When the table has per-row boxes, the box narrows to the **row**.
5. If not found, the value is kept but marked **unverified**. On screen it
   shows ⚠ "check it on the page".

`verified` means *found in SaatruAI's text*. If SaatruAI misread the scan,
the misreading is "verified" too. The highlight on the PDF is what lets a
person check that by eye.

## Saving

Each document is saved as soon as it finishes, with `status: ready` or
`failed`, and `progress.done` goes up by one. A document that fails doesn't
stop the others. A missing `OPENAI_API_KEY` stops the whole run with a clear
message.

| Saved per document | |
|---|---|
| `summary` | The Markdown summary with `[C…]` citations |
| `values[]` | name, value, unit, range, flag, section, source block, page, box, verified |
| `valueCount`, `flaggedCount` | Flagged = `low`, `high` or `abnormal` |
| `patient`, `referredBy`, `date`, `facility` | From the split, or from the results call when the split had none |
