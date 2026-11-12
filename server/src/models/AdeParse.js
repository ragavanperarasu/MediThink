import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * LandingAI ADE's full response for one upload, kept as it came back — the
 * raw JSON the report's text, chunks and boxes were read from. Stored apart
 * from the report so the report document stays small; also written to
 * uploads/<report>/source.json next to the PDF.
 */
const AdeParseSchema = new Schema(
  {
    report: { type: Schema.Types.ObjectId, ref: 'Report', required: true, index: true },
    account: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    profile: { type: Schema.Types.ObjectId, ref: 'Profile' },
    jobId: { type: String, default: '' },
    model: { type: String, default: '' },
    pageCount: { type: Number, default: 0 },
    creditUsage: { type: Number, default: null },
    durationMs: { type: Number, default: null },
    failedPages: { type: [Number], default: [] },
    // True when the per-cell grounding map was left out to fit MongoDB's 16 MB
    // limit; source.json on disk always has everything.
    trimmed: { type: Boolean, default: false },
    response: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true, minimize: false },
);

export default mongoose.model('AdeParse', AdeParseSchema);
