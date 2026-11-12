import mongoose from 'mongoose';

/*
 * An account: what someone signs in with. One account holds several profiles
 * (models/Profile.js) — the people whose reports it keeps.
 *
 * Accounts made through sign-up use their email as the username too, so the
 * existing unique username index covers them; the admin from .env signs in
 * with a plain username and has no email.
 */
const UserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
    // Set when the account signs in with Google ("Continue with Google").
    googleId: { type: String, unique: true, sparse: true },
    // The Google account's photo, refreshed at every Google sign-in. Shown on
    // the account's main profile only — never on family members' profiles.
    picture: { type: String, default: '' },
    displayName: { type: String, default: 'Administrator' },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    passwordHash: { type: String, required: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

UserSchema.methods.toPublic = function toPublic() {
  return {
    id: String(this._id),
    username: this.username,
    email: this.email ?? '',
    picture: this.picture ?? '',
    displayName: this.displayName,
    role: this.role,
  };
};

export default mongoose.model('User', UserSchema);
