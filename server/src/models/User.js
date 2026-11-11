import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    displayName: { type: String, default: 'Administrator' },
    role: { type: String, enum: ['admin'], default: 'admin' },
    passwordHash: { type: String, required: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

UserSchema.methods.toPublic = function toPublic() {
  return {
    id: String(this._id),
    username: this.username,
    displayName: this.displayName,
    role: this.role,
  };
};

export default mongoose.model('User', UserSchema);
