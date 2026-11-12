import mongoose from 'mongoose';

const { Schema } = mongoose;

export const RELATIONS = ['self', 'spouse', 'child', 'parent', 'sibling', 'other'];
export const SEXES = ['', 'female', 'male', 'other'];
/** Avatar colours a profile can take; given in turn as profiles are added. */
export const PROFILE_COLORS = ['#2f7cf7', '#16a34a', '#d97706', '#db2777', '#7c3aed', '#0d9488', '#dc2626', '#475569'];
export const MAX_PROFILES = 10;

/**
 * One person under an account — the account holder, or a family member whose
 * reports they keep. Every report belongs to exactly one profile.
 */
const ProfileSchema = new Schema(
  {
    account: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    relation: { type: String, enum: RELATIONS, default: 'other' },
    // "YYYY-MM-DD", or empty when not given.
    dateOfBirth: { type: String, default: '' },
    sex: { type: String, enum: SEXES, default: '' },
    color: { type: String, default: PROFILE_COLORS[0] },
    // The account holder's own profile — made with the account, and the only
    // one that shows the Google photo. It cannot be deleted.
    primary: { type: Boolean, default: false },
  },
  { timestamps: true },
);

/** `account` (the User) supplies the photo for the main profile. */
ProfileSchema.methods.toPublic = function toPublic(account) {
  return {
    id: String(this._id),
    name: this.name,
    relation: this.relation,
    dateOfBirth: this.dateOfBirth,
    sex: this.sex,
    color: this.color,
    primary: Boolean(this.primary),
    picture: this.primary && account?.picture ? account.picture : '',
    createdAt: this.createdAt,
  };
};

export default mongoose.model('Profile', ProfileSchema);
