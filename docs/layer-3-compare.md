# Layer 3 · Compare over time

**Job:** when an upload holds two or more reports of the same kind (e.g.
blood reports from June and October), show each test side by side: what went
up, what went down, and whether it moved into or out of its range.

**Model:** only where it is better than code: pairing tests that are named
differently, and putting the computed table into words. **Every number is
computed in code.**
**Code:** [`server/src/lib/compare.js`](../server/src/lib/compare.js),
`compareDocuments` in [`analyse.js`](../server/src/lib/analyse.js), and
`MATCH_PROMPT` / `CHANGES_PROMPT` in [`prompts.js`](../server/src/lib/prompts.js).

## When it runs

For each kind that has two or more documents marked `ready` with at least one
value. Documents are taken in Layer 1's order, oldest first. A kind that
appears once (like the ECG in `mr1`) is not compared.

## Step 1 · Exact names (code)

Names are compared lowercase, letters and digits only, with `&` read as
`and`. So these all match:

```
"Fasting Glucose" = "FASTING GLUCOSE" = "Fasting-Glucose"
"Postprandial Glucose" = "Post-prandial glucose"
```

Two safeguards:
- **A name used twice in one report** (e.g. "Fasting" under glucose *and*
  under urine) is told apart by its section.
- **A number and a word result** (`176.0` vs `1+`) are never put in the same
  row, even when the names match.

## Step 2 · Different names (model, then code)

Only the tests **left over** after Step 1 are sent, one list per report:

```
Report 1 (12.06.2026):
  d1v0 · FBS · 198.0 mg/dl
  d1v3 · Haemoglobin · 11.2 g/dl
Report 2 (31.10.2026):
  d2v0 · Fasting Blood Sugar · 176.0 mg/dl
  d2v3 · Hb · 13.6 g/dl
```

The model returns groups such as `[["d1v0","d2v0"],["d1v3","d2v3"]]`. It is
told:
- Group only when it is certain.
- Never group different tests: fasting vs postprandial, blood vs urine,
  total vs direct, HbA1c vs glucose.
- A missed match is harmless; a wrong one is not.

**Code then checks every group (`checkPairs`).** A group is rejected unless:

| Check | Why |
|---|---|
| Every id is a real leftover | The model can't invent or reuse a test |
| At most one id per report | A test can't be matched to itself |
| All numbers, or all words | `176` and `1+` are not the same measurement |
| No two different units | `mg/dl` and `mmol/L` are not paired |

Rows matched this way are marked `matchedBy: "meaning"` and shown with **≈**,
with both names on hover. If this call fails, the tests just stay as separate
rows.

## Step 3 · The change (code only)

For each row, the **last two** reports that have it are compared.

| Situation | Result |
|---|---|
| Both values are plain numbers, same unit, both verified in Layer 2 | Difference and % computed |
| Either value was not verified | Not compared: "A value was not found exactly in the report text" |
| Not a single number (`<5`, `92 / 57`, `1+`, `Positive`) | Not compared; shown as **Same** or **Changed** |
| Units differ (`uIU/ml` vs `mIU/L`) | Not compared: "Units differ". Units are never converted. |
| Only one report has it | Listed under "In one report only" |

How numbers are read:
- `1,50,000` → 150000.
- `64%` → 64 with unit `%`.
- `0.7m / sec` → 0.7 with unit `m/sec`.

Arithmetic is done on whole numbers scaled to the printed decimals, so there is
no floating-point noise. `9.1 → 7.40` gives `-1.70`, never `-1.6999999`. The
percentage is against the earlier value, to one decimal place.

**Range movement**, judged against the range printed on **each** report:

| Before | After | Shown as |
|---|---|---|
| Out of range | In range | Now in range |
| In range | Out of range | Now out of range |
| Out of range | Out of range | Still out of range |
| In range | In range | (nothing) |

No change is called *better* or *worse*. That is a clinical judgement; the
screen only says up/down and in/out of the printed range.

## Step 4 · In words (model, then code)

The model receives **only the computed table** as text and writes 2–5 bullet
points. It must copy figures exactly, never calculate, and never judge.

**Code then checks the explanation (`narrativeIsFaithful`).** Every number in
it must appear somewhere in the table. One number that isn't there (say, an
invented `150`) and the explanation is discarded. The table is shown on its
own, and the dropped figures are logged as `[compare] … explanation dropped`.

## Verified result

From the test upload (two blood reports with different test names):

| Test | 12.06.2026 | 31.10.2026 | Change |
|---|---|---|---|
| FBS ≈ Fasting Blood Sugar | 198.0 | 176.0 | −22.0 (−11.1%) · still out of range |
| PPBS ≈ Post Prandial Blood Sugar | 301.0 | 269.0 | −32.0 (−10.6%) · still out of range |
| HbA1c | 9.1 | 7.40 | −1.70 (−18.7%) · still out of range |
| Haemoglobin ≈ Hb | 11.2 | 13.6 | +2.4 (+21.4%) · now in range |
| Serum Creatinine ≈ Creatinine | 0.9 | 1.0 | +0.1 (+11.1%) |
| TSH | 3.2 uIU/ml | 3.2 mIU/L | not compared: units differ |

## Saved

`report.comparisons[]`, one entry per kind:

```
{ category, documents: [{ n, title, date, dateISO }],
  rows: [{ name, names, section, matchedBy: "name" | "meaning",
           cells: [ { n, value, unit, range, flag, verified, page, box, source } | null ],
           change: { computed, delta, percent, direction, unit, range, reason } }],
  narrative }
```

Each cell keeps its page and box, so clicking a value in the table opens that
report with the value highlighted.
