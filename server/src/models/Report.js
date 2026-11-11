import mongoose from 'mongoose';
import { REPORT_TYPES } from '../lib/reportTypes.js';

const { Schema } = mongoose;

/** A normalized rectangle on a page: every edge is a fraction of the page, 0–1. */
const BoxSchema = new Schema(
  { l: Number, t: Number, r: Number, b: Number },
  { _id: false },
);

/** One table row's text and the rectangle around it — finer than the table's own box. */
const RowSchema = new Schema({ text: String, box: BoxSchema }, { _id: false });

/**
 * One block of the SaatruAI export: a paragraph, a table, a heading.
 *
 * `ref` (C1, C2, …) is the short name the model sees and cites. It is the
 * block's position in reading order, so it is stable for the life of the
 * record and cheap in tokens, unlike the export's own ids.
 */
const ChunkSchema = new Schema(
  {
    ref: { type: String, required: true },
    id: String,
    type: String,
    page: { type: Number, default: 0 },
    text: String,
    box: { type: BoxSchema, default: null },
    rows: { type: [RowSchema], default: undefined },
    confidence: { type: Number, default: null },
  },
  { _id: false },
);

const FLAGS = ['low', 'high', 'abnormal', 'normal', 'unknown'];

const ValueSchema = new Schema(
  {
    name: String,
    value: String,
    unit: String,
    range: String,
    flag: { type: String, enum: FLAGS, default: 'unknown' },
    section: String,
    // Where it was read from. `verified` is true only when the printed value
    // was found, character for character, in the block the model cited.
    source: { type: String, default: '' },
    page: { type: Number, default: null },
    box: { type: BoxSchema, default: null },
    verified: { type: Boolean, default: false },
  },
  { _id: false },
);

/**
 * One document found inside the upload — an echo, an ECG, a lab report — by
 * the first-layer split. Each is read and summarised on its own. `pages` are
 * the upload's own page indices (0-based); `n` is its place in reading order
 * and names its split PDF, documents/document-<n>.pdf.
 */
const DocumentSchema = new Schema(
  {
    n: { type: Number, required: true },
    category: { type: String, enum: REPORT_TYPES, default: 'other' },
    title: { type: String, default: '' },
    pages: { type: [Number], default: [] },
    date: { type: String, default: '' },
    dateISO: { type: String, default: '' },
    facility: { type: String, default: '' },
    patient: {
      name: { type: String, default: '' },
      age: { type: String, default: '' },
      sex: { type: String, default: '' },
    },
    referredBy: { type: String, default: '' },
    hasPdf: { type: Boolean, default: false },
    status: { type: String, enum: ['analysing', 'ready', 'failed'], default: 'analysing' },
    error: { type: String, default: '' },
    summary: { type: String, default: '' },
    values: { type: [ValueSchema], default: [] },
    valueCount: { type: Number, default: 0 },
    flaggedCount: { type: Number, default: 0 },
  },
  { _id: false },
);

const MessageSchema = new Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const ReportSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    // 'user' once someone has typed a title, so a re-analysis never overwrites it.
    titleSource: { type: String, enum: ['user', 'file', 'detected'], default: 'file' },
    reportType: { type: String, enum: ['auto', ...REPORT_TYPES], default: 'auto' },
    status: {
      type: String,
      enum: ['uploaded', 'analysing', 'ready', 'failed'],
      default: 'uploaded',
      index: true,
    },
    error: { type: String, default: '' },

    source: {
      jsonFilename: String,
      jsonBytes: Number,
      pdfFilename: { type: String, default: '' },
      pdfBytes: { type: Number, default: 0 },
      hasPdf: { type: Boolean, default: false },
      pageCount: { type: Number, default: 1 },
      classification: { type: String, default: '' },
      meanConfidence: { type: Number, default: null },
      reviewCount: { type: Number, default: 0 },
    },

    markdown: { type: String, default: '' },
    chunks: { type: [ChunkSchema], default: [] },

    patient: {
      name: { type: String, default: '' },
      age: { type: String, default: '' },
      sex: { type: String, default: '' },
    },
    reportDate: { type: String, default: '' },
    facility: { type: String, default: '' },
    referredBy: { type: String, default: '' },

    // The documents inside the upload, in reading order. Reports analysed
    // before the split existed have none; their summary and values below
    // stand for the whole upload.
    documents: { type: [DocumentSchema], default: [] },
    documentTypes: { type: [String], default: [], index: true },
    // Changes over time between documents of the same kind, computed in
    // code (lib/compare.js). Stored as built; never edited by hand.
    comparisons: { type: [Schema.Types.Mixed], default: [] },
    // While analysing: 'splitting', then 'analysing' with done/total documents.
    progress: {
      stage: { type: String, default: '' },
      done: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },

    summary: { type: String, default: '' },
    values: { type: [ValueSchema], default: [] },
    valueCount: { type: Number, default: 0 },
    flaggedCount: { type: Number, default: 0 },
    analysedAt: { type: Date, default: null },
    model: { type: String, default: '' },

    messages: { type: [MessageSchema], default: [] },
    questionCount: { type: Number, default: 0 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

ReportSchema.index({ createdAt: -1 });

export default mongoose.model('Report', ReportSchema);
