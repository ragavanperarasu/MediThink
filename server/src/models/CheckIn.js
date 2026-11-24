import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * One day's check-in for one profile: what was said in the voice chat, and
 * the short notes written from it (lib/checkin.js). A second chat on the same
 * day is added to that day's, and the notes are written again from both.
 */
const TurnSchema = new Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const CheckInSchema = new Schema(
  {
    account: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    profile: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    // "YYYY-MM-DD" in the app's time zone (TIMEZONE).
    day: { type: String, required: true },
    language: { type: String, default: 'en' },
    turns: { type: [TurnSchema], default: [] },
    // The notes: good | okay | unwell | '' (not said).
    feeling: { type: String, default: '' },
    points: { type: [String], default: [] },
    tellDoctor: { type: [String], default: [] },
    // false when the notes could not be written; the next visit tries again.
    noted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

CheckInSchema.index({ profile: 1, day: -1 }, { unique: true });

CheckInSchema.methods.toPublic = function toPublic() {
  return {
    id: String(this._id),
    day: this.day,
    language: this.language,
    feeling: this.feeling,
    points: this.points,
    tellDoctor: this.tellDoctor,
    noted: this.noted,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('CheckIn', CheckInSchema);
