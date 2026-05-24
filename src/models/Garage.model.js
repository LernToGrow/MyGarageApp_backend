const mongoose = require('mongoose');

const GarageSchema = new mongoose.Schema({
  name:           { type: String, required: true },
  owner_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  phone:          { type: String, required: true },
  address:        { type: String },
  city:           { type: String, default: 'Pune' },
  gstin:          { type: String },
  logo_url:          { type: String },
  garage_photo_url:  { type: String },
  gallery:           { type: [String], default: [] },
  language:       { type: String, enum: ['en', 'mr', 'hi'], default: 'en' },
  created_at:     { type: Date, default: Date.now },
});

module.exports = mongoose.model('Garage', GarageSchema);
