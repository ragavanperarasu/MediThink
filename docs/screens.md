# Screens

How each layer's output appears. The client is in [`client/src`](../client/src).

## Routes

| URL | Screen | Shows |
|---|---|---|
| `/reports` | Library | One line per upload: a folder icon when it holds several documents, otherwise the kind's icon. A pill appears only for **flagged**, **Reading** or **Failed**. |
| `/reports/:id` | Upload | **Several documents:** a folder, listing the documents in Layer 1's order. **One document:** that document directly. |
| `/reports/:id/compare` | Changes over time | Layer 3's tables. The tab appears only when a kind repeats. |
| `/reports/:id/documents/:n` | One document | Summary, Results, Ask and Text on the left; the document's own PDF on the right |

## While it works

The page polls `GET /api/reports/:id/status` every 2 seconds and shows the
current stage:

```
✓ Reading 90 blocks from the SaatruAI JSON
◌ Splitting the PDF into separate documents          ← stage "splitting"
· Reading each document — 2 of 4 done                ← stage "analysing"
· Comparing reports of the same kind over time       ← stage "comparing"
```

The page reloads each time the stage or count moves, so the documents appear
as soon as the split is saved.

## One document

| Tab | Content |
|---|---|
| Summary | The "N flagged" list, only when something is flagged, then the summary with **p.N** citation pins |
| Results | Test · Result · Reference. A High/Low pill only on flagged rows; ⚠ only on values not found in the text |
| Ask | The upload's thread (Layer 4) |
| Text | The document's blocks as SaatruAI read them; click one to see it on the page |

The PDF on the right is the document's own split file. Values and citations
keep the **upload's** page numbers. The viewer maps them to the split file's
pages, so the bar reads "Page 1 / 1 · p.6 of upload". The **‹ 2 / 4 ›**
arrows move between documents.

Clicking anything with a page (a result, a citation pin, a value in the
Changes table) opens the right document and outlines the exact box: the table
row when per-row boxes exist, otherwise the block.
