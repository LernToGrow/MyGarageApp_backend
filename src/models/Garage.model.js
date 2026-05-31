const mongoose = require('mongoose');

const GarageSchema = new mongoose.Schema({
  name:           { type: String, required: true },
  owner_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  phone:          { type: String, required: true },
  address:        { type: String },
  state:          { type: String, default: '' },
  district:       { type: String, default: '' },
  taluka:         { type: String, default: '' },
  city:           { type: String, default: '' },
  pincode:        { type: String, default: '' },
  gstin:          { type: String },
  logo_url:          { type: String },
  garage_photo_url:  { type: String },
  gallery:           { type: [String], default: [] },
  language:       { type: String, enum: ['en', 'mr', 'hi'], default: 'en' },
  is_active:      { type: Boolean, default: true },
  plan:           { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
  plan_expires_at: { type: Date },
  created_at:     { type: Date, default: Date.now },
});

GarageSchema.index({ name: 'text' });
GarageSchema.index({ state: 1, district: 1, taluka: 1 });
GarageSchema.index({ is_active: 1 });
GarageSchema.index({ plan: 1 });
GarageSchema.index({ created_at: -1 });
GarageSchema.index({ owner_id: 1 });

module.exports = mongoose.model('Garage', GarageSchema);
