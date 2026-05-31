const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  phone:       { type: String, required: true, unique: true },
  name:        { type: String, required: true },
  role:        { type: String, enum: ['garage_owner', 'employee', 'super_admin'], required: true },
  garage_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'Garage' },
  permissions: {
    type: [String],
    default: ['add_job', 'edit_job', 'manage_customers'],
  },
  language:    { type: String, enum: ['en', 'mr', 'hi'], default: 'en' },
  photo_url:   { type: String },
  is_active:   { type: Boolean, default: true },
  invited_by:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at:  { type: Date, default: Date.now },

  // Password auth
  password_hash:         { type: String },
  reset_token:           { type: String },
  reset_token_expires:   { type: Date },
});

// Compare a plain-text password against the stored hash
UserSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password_hash);
};

module.exports = mongoose.model('User', UserSchema);
