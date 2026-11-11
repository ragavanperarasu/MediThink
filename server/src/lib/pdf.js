import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { HttpError } from './http.js';

/*
 * The uploaded PDF is never read for text: SaatruAI already did that, and the
 * JSON carries the result. MediThink only counts its pages, to be sure it is
 * the same document the JSON describes, and cuts it into one file per
 * document once the bundle has been split.
 */

async function open(buffer) {
  try {
    return await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
  } catch {
    throw new HttpError(422, 'The PDF could not be opened. Download the annotated PDF from SaatruAI again.');
  }
}

/** Page count, or a 422 when the file cannot be read as a PDF. */
export async function countPages(buffer) {
  return (await open(buffer)).getPageCount();
}

export const documentPdfPath = (dir, n) => path.join(dir, 'documents', `document-${n}.pdf`);

/**
 * Writes documents/document-<n>.pdf for each document, holding only its pages.
 * Returns the set of document numbers that were written; one that fails is
 * left out, and the viewer falls back to the whole PDF for it.
 */
export async function splitPdf(dir, documents) {
  const written = new Set();
  const folder = path.join(dir, 'documents');
  await fs.rm(folder, { recursive: true, force: true });

  let source;
  try {
    source = await open(await fs.readFile(path.join(dir, 'source.pdf')));
  } catch (err) {
    console.error('[pdf] source unreadable:', err.message);
    return written;
  }
  await fs.mkdir(folder, { recursive: true });

  const total = source.getPageCount();
  for (const doc of documents) {
    try {
      const pages = doc.pages.filter((p) => p >= 0 && p < total);
      if (!pages.length) continue;
      const part = await PDFDocument.create();
      const copied = await part.copyPages(source, pages);
      copied.forEach((page) => part.addPage(page));
      part.setTitle(doc.title || `Document ${doc.n}`);
      await fs.writeFile(documentPdfPath(dir, doc.n), await part.save());
      written.add(doc.n);
    } catch (err) {
      console.error(`[pdf] document ${doc.n} could not be split:`, err.message);
    }
  }
  return written;
}
