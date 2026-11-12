import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * One Assistant thread. A profile has one per scope:
 *   "all"            every report of the profile
 *   "type:<kind>"    every report of one kind (blood, ecg, …)
 *   "doc:<id>:<n>"   one report — document n of upload <id>
 */
const MessageSchema = new Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const ConversationSchema = new Schema(
  {
    account: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    profile: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    scope: { type: String, required: true },
    messages: { type: [MessageSchema], default: [] },
  },
  { timestamps: true },
);

ConversationSchema.index({ profile: 1, scope: 1 }, { unique: true });

export default mongoose.model('Conversation', ConversationSchema);
