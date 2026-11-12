import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { env } from '../env.js';
import Report from '../models/Report.js';
import AdeParse from '../models/AdeParse.js';
import Conversation from '../models/Conversation.js';
import { readAdeDocument } from '../lib/ade.js';
import { startAnalysis } from '../lib/analyse.js';
import { HttpError, wrap } from '../lib/http.js';
import { countPages, documentPdfPath } from '../lib/pdf.js';
import { LANDINGAI_MISSING } from '../lib/landing.js';
import { isReportType, REPORT_TYPES } from '../lib/reportTypes.js';

const router = Router();

/* ── helpers ─────────────────────────────────────────────────────────── */

const reportDir = (id) => path.join(env.STORAGE_DIR, String(id));

/** Multer reads filenames as latin1; browsers send UTF-8. */
const fixName = (name) => Buffer.from(String(name ?? ''), 'latin1').toString('utf8');

/** Every query is limited to the profile in use; another profile's report answers 404. */
const own = (req) => ({ account: req.user._id, profile: req.profile._id });

async function findReport(req, id, projection) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new HttpError(404, 'That report does not exist.');
  const report = await Report.findOne({ _id: id, ...own(req) }, projection).lean();
  if (!report) throw new HttpError(404, 'That report does not exist.');
  return report;
}

/** The shape every list and card reads. */
function toSummary(report) {
  return {
    id: String(report._id),
    title: report.title,
    reportType: report.reportType,
    documentTypes: report.documentTypes?.length ? report.documentTypes : [report.reportType].filter((t) => isReportType(t)),
    documentCount: report.documents?.length || 1,
    // Each document in the upload, slim — the Reports list shows every one
    // as its own row.
    documents: (report.documents ?? []).map((d) => ({
      n: d.n,
      title: d.title || '',
      category: d.category || 'other',
      date: d.date || '',
      dateISO: d.dateISO || '',
      pageCount: d.pages?.length ?? 0,
      status: d.status || 'ready',
      valueCount: d.valueCount ?? 0,
      flaggedCount: d.flaggedCount ?? 0,
    })),
    status: report.status,
    error: report.error || '',
    patient: report.patient ?? { name: '', age: '', sex: '' },
    reportDate: report.reportDate || '',
    facility: report.facility || '',
    referredBy: report.referredBy || '',
    valueCount: report.valueCount ?? 0,
    flaggedCount: report.flaggedCount ?? 0,
    questionCount: report.questionCount ?? 0,
    source: {
      hasPdf: Boolean(report.source?.hasPdf),
      pageCount: report.source?.pageCount ?? 1,
      jsonFilename: report.source?.jsonFilename ?? '',
      pdfFilename: report.source?.pdfFilename ?? '',
      classification: report.source?.classification ?? '',
      meanConfidence: report.source?.meanConfidence ?? null,
      reviewCount: report.source?.reviewCount ?? 0,
    },
    model: report.model || '',
    analysedAt: report.analysedAt,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

/**
 * The documents in an upload. One analysed before the split existed is shown
 * as a single document holding every page, so the page needs only one shape.
 */
function documentsOf(report) {
  if (report.documents?.length) return report.documents;
  if (!report.summary) return [];
  const pageCount = report.source?.pageCount ?? 1;
  return [{
    n: 1,
    category: isReportType(report.reportType) ? report.reportType : 'other',
    title: report.title,
    pages: Array.from({ length: pageCount }, (_, i) => i),
    date: report.reportDate || '',
    dateISO: '',
    facility: report.facility || '',
    patient: report.patient ?? { name: '', age: '', sex: '' },
    referredBy: report.referredBy || '',
    hasPdf: false,
    status: 'ready',
    error: '',
    summary: report.summary,
    values: report.values ?? [],
    valueCount: report.valueCount ?? 0,
    flaggedCount: report.flaggedCount ?? 0,
  }];
}

function toDetail(report) {
  const documents = documentsOf(report);
  return {
    ...toSummary(report),
    documents,
    // Every document's values together, for whatever looks across the upload.
    values: documents.flatMap((d) => d.values ?? []),
    progress: report.progress ?? { stage: '', done: 0, total: 0 },
    comparisons: report.comparisons ?? [],
    markdown: report.markdown || '',
    chunks: (report.chunks ?? []).map(({ rows: _rows, ...chunk }) => chunk),
    messages: report.messages ?? [],
  };
}

const LIST_PROJECTION = { markdown: 0, chunks: 0, values: 0, messages: 0, summary: 0, comparisons: 0, 'documents.values': 0, 'documents.summary': 0 };

/* ── upload ──────────────────────────────────────────────────────────── */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 2, fields: 10 },
}).fields([
  { name: 'json', maxCount: 1 },
  { name: 'pdf', maxCount: 1 },
]);

function receiveFiles(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new HttpError(413, `Each file can be at most ${Math.round(env.MAX_UPLOAD_BYTES / 1048576)} MB.`));
    }
    return next(new HttpError(400, err.message || 'The upload could not be read.'));
  });
}

const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many uploads in a minute. Wait a moment and try again.' },
});

/** A Mongo document stops at 16 MB; leave headroom for values and the thread. */
const MAX_STORED_BYTES = 12 * 1024 * 1024;

router.post(
  '/',
  uploadLimiter,
  receiveFiles,
  wrap(async (req, res) => {
    const jsonFile = req.files?.json?.[0];
    const pdfFile = req.files?.pdf?.[0];

    if (!pdfFile) throw new HttpError(400, 'Attach the report PDF.');
    if (pdfFile.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new HttpError(422, 'That file is not a PDF.');
    }
    const pdfPages = await countPages(pdfFile.buffer);
    const pdfName = fixName(pdfFile.originalname);

    /*
     * Two ways in:
     *   PDF alone      → LandingAI ADE reads it in the background (lib/landing.js).
     *   PDF + JSON     → a SaatruAI export already holds the reading; ADE is skipped.
     */
    let ade = null;
    let jsonName = '';
    if (jsonFile) {
      let raw;
      try {
        raw = JSON.parse(jsonFile.buffer.toString('utf8'));
      } catch {
        throw new HttpError(422, 'That JSON file is not valid JSON.');
      }
      ade = readAdeDocument(raw);
      jsonName = fixName(jsonFile.originalname);
      // Every box in the JSON is placed by page number, so the PDF must be the
      // very document the JSON was made from — the same pages, in the same order.
      if (pdfPages !== ade.pageCount) {
        throw new HttpError(
          422,
          `The PDF has ${pdfPages} page${pdfPages === 1 ? '' : 's'} but the JSON describes ${ade.pageCount}. Upload the PDF and the JSON from the same document.`,
        );
      }
      const stored = Buffer.byteLength(ade.markdown) + Buffer.byteLength(JSON.stringify(ade.chunks));
      if (stored > MAX_STORED_BYTES) {
        throw new HttpError(413, 'This export is too large to analyse as one report. Split the PDF and upload the parts.');
      }
    } else if (!env.LANDINGAI_API_KEY) {
      throw new HttpError(503, LANDINGAI_MISSING);
    }

    const requestedType = String(req.body?.reportType ?? 'auto');
    const typedTitle = String(req.body?.title ?? '').trim().slice(0, 160);
    const fileTitle =
      ((ade?.filename) || pdfName || jsonName)
        .replace(/\.(pdf|json)$/i, '')
        .replace(/-annotated$/i, '')
        .replace(/[-_]+/g, ' ')
        .trim() || 'Untitled report';

    const report = new Report({
      title: typedTitle || fileTitle,
      titleSource: typedTitle ? 'user' : 'file',
      reportType: isReportType(requestedType) ? requestedType : 'auto',
      status: 'uploaded',
      markdown: ade?.markdown ?? '',
      chunks: ade?.chunks ?? [],
      source: {
        jsonFilename: jsonName,
        jsonBytes: jsonFile?.size ?? 0,
        pdfFilename: pdfName,
        pdfBytes: pdfFile.size,
        hasPdf: true,
        pageCount: ade?.pageCount ?? pdfPages,
        classification: ade?.classification ?? '',
        meanConfidence: ade?.meanConfidence ?? null,
        reviewCount: ade?.reviewCount ?? 0,
        extractor: ade ? 'saatru' : 'landingai',
      },
      createdBy: req.user._id,
      account: req.user._id,
      profile: req.profile._id,
    });

    // Files first, record second: a record must never point at files that
    // were not written. A failed save removes what was written.
    const dir = reportDir(report._id);
    await fs.mkdir(dir, { recursive: true });
    try {
      // With LandingAI, source.json is written once ADE has answered.
      if (jsonFile) await fs.writeFile(path.join(dir, 'source.json'), jsonFile.buffer);
      await fs.writeFile(path.join(dir, 'source.pdf'), pdfFile.buffer);
      await report.save();
    } catch (err) {
      await fs.rm(dir, { recursive: true, force: true });
      throw err;
    }

    await startAnalysis(report._id);
    res.status(201).json({ report: toSummary(await Report.findById(report._id, LIST_PROJECTION).lean()) });
  }),
);

/* ── read ────────────────────────────────────────────────────────────── */

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get(
  '/',
  wrap(async (req, res) => {
    const filter = own(req);
    const q = String(req.query.q ?? '').trim().slice(0, 100);
    const type = String(req.query.type ?? '');
    const limit = Math.min(200, Math.max(1, Number.parseInt(String(req.query.limit ?? '100'), 10) || 100));

    if (q) {
      const pattern = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ title: pattern }, { 'patient.name': pattern }, { facility: pattern }, { 'documents.title': pattern }];
    }
    // An upload matches a kind when any document in it is of that kind.
    if (isReportType(type)) filter.$and = [{ $or: [{ documentTypes: type }, { documentTypes: { $size: 0 }, reportType: type }] }];
    if (req.query.flagged === '1') filter.flaggedCount = { $gt: 0 };

    const reports = await Report.find(filter, LIST_PROJECTION).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ reports: reports.map(toSummary) });
  }),
);

/** Calendar day key in the configured timezone, e.g. "2026-11-11". */
const dayKey = (date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: env.TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

router.get(
  '/stats',
  wrap(async (req, res) => {
    const DAYS = 14;
    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

    const mine = own(req);
    const [[totals], byType, recent] = await Promise.all([
      Report.aggregate([
        { $match: mine },
        {
          $group: {
            _id: null,
            reports: { $sum: 1 },
            // Reports as the Reports list shows them: each document in an upload.
            documents: { $sum: { $max: [1, { $size: { $ifNull: ['$documents', []] } }] } },
            ready: { $sum: { $cond: [{ $eq: ['$status', 'ready'] }, 1, 0] } },
            analysing: { $sum: { $cond: [{ $eq: ['$status', 'analysing'] }, 1, 0] } },
            failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
            values: { $sum: '$valueCount' },
            flagged: { $sum: '$flaggedCount' },
            reportsWithFlags: { $sum: { $cond: [{ $gt: ['$flaggedCount', 0] }, 1, 0] } },
            questions: { $sum: '$questionCount' },
          },
        },
      ]),
      // Counted by document kind: an upload holding an ECG and a lab report counts once for each.
      Report.aggregate([
        { $match: mine },
        {
          $project: {
            types: {
              $cond: [{ $gt: [{ $size: { $ifNull: ['$documentTypes', []] } }, 0] }, '$documentTypes', ['$reportType']],
            },
          },
        },
        { $unwind: '$types' },
        { $group: { _id: '$types', count: { $sum: 1 } } },
      ]),
      Report.find({ ...mine, createdAt: { $gte: since } }, { createdAt: 1 }).lean(),
    ]);

    const counts = new Map();
    for (const r of recent) counts.set(dayKey(r.createdAt), (counts.get(dayKey(r.createdAt)) ?? 0) + 1);
    const activity = Array.from({ length: DAYS }, (_, i) => {
      const date = dayKey(new Date(Date.now() - (DAYS - 1 - i) * 24 * 60 * 60 * 1000));
      return { date, count: counts.get(date) ?? 0 };
    });

    res.json({
      totals: {
        reports: 0, documents: 0, ready: 0, analysing: 0, failed: 0, values: 0, flagged: 0, reportsWithFlags: 0, questions: 0,
        ...(totals ? { ...totals, _id: undefined } : {}),
      },
      byType: Object.fromEntries(['auto', ...REPORT_TYPES].map((t) => [t, byType.find((b) => b._id === t)?.count ?? 0])),
      activity,
    });
  }),
);

router.get(
  '/:id',
  wrap(async (req, res) => {
    res.json({ report: toDetail(await findReport(req, req.params.id)) });
  }),
);

/** Polled while an analysis runs — small, so polling every two seconds is cheap. */
router.get(
  '/:id/status',
  wrap(async (req, res) => {
    const report = await findReport(req, req.params.id, { status: 1, error: 1, progress: 1 });
    res.json({ status: report.status, error: report.error || '', progress: report.progress ?? null });
  }),
);

router.get(
  '/:id/file.pdf',
  wrap(async (req, res) => {
    const report = await findReport(req, req.params.id, { source: 1 });
    if (!report.source?.hasPdf) throw new HttpError(404, 'No PDF was uploaded with this report.');
    // The page CSP (object-src 'none') stops the browser's own PDF viewer
    // drawing it when the file is opened in a tab. A PDF is not a page.
    res.removeHeader('Content-Security-Policy');
    res.sendFile(path.join(reportDir(report._id), 'source.pdf'), {
      headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'private, max-age=300' },
    });
  }),
);

/** One document's pages, cut from the upload once the split is known. */
router.get(
  '/:id/documents/:n/file.pdf',
  wrap(async (req, res) => {
    const report = await findReport(req, req.params.id, { documents: 1 });
    const n = Number.parseInt(req.params.n, 10);
    const doc = report.documents?.find((d) => d.n === n);
    if (!doc?.hasPdf) throw new HttpError(404, 'That document has no PDF of its own.');
    res.removeHeader('Content-Security-Policy');
    res.sendFile(documentPdfPath(reportDir(report._id), n), {
      headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'private, max-age=60' },
    });
  }),
);

router.get(
  '/:id/source.json',
  wrap(async (req, res) => {
    const report = await findReport(req, req.params.id, { source: 1 });
    const file = path.join(reportDir(report._id), 'source.json');
    const exists = await fs.access(file).then(() => true, () => false);
    if (!exists) throw new HttpError(404, 'This PDF has not been read yet, so there is no JSON to download.');
    const name = (report.source?.jsonFilename || 'report.json').replace(/[^\w.\- ]+/g, '_');
    res.download(file, name);
  }),
);

/* ── change ──────────────────────────────────────────────────────────── */

router.patch(
  '/:id',
  wrap(async (req, res) => {
    const report = await findReport(req, req.params.id, { _id: 1 });
    const set = {};

    if (req.body?.title !== undefined) {
      const title = String(req.body.title).trim().slice(0, 160);
      if (!title) throw new HttpError(400, 'A report needs a title.');
      Object.assign(set, { title, titleSource: 'user' });
    }
    if (req.body?.reportType !== undefined) {
      if (!isReportType(req.body.reportType)) throw new HttpError(400, 'Unknown report type.');
      set.reportType = req.body.reportType;
    }

    await Report.updateOne({ _id: report._id }, { $set: set });
    res.json({ report: toSummary(await findReport(req, report._id, LIST_PROJECTION)) });
  }),
);

const modelLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests in a minute. Wait a moment and try again.' },
});

router.post(
  '/:id/analyse',
  modelLimiter,
  wrap(async (req, res) => {
    const report = await findReport(req, req.params.id, { _id: 1 });
    const started = await startAnalysis(report._id);
    res.status(202).json({ started, status: 'analysing' });
  }),
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    const report = await findReport(req, req.params.id, { _id: 1 });
    await Report.deleteOne({ _id: report._id });
    await AdeParse.deleteMany({ report: report._id });
    // Its own Assistant threads go with it.
    await Conversation.deleteMany({ profile: req.profile._id, scope: new RegExp(`^doc:${report._id}:`) });
    await fs.rm(reportDir(report._id), { recursive: true, force: true });
    res.json({ ok: true });
  }),
);

export default router;
