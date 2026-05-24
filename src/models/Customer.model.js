const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema({
  garage_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'Garage', required: true },
  name:       { type: String, required: true },
  phone:      { type: String, required: true },
  address:    { type: String },
  language:   { type: String, enum: ['en', 'mr', 'hi'], default: 'en' },
  bikes:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bike' }],
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now },
});

// Compound index: one customer per phone per garage
CustomerSchema.index({ garage_id: 1, phone: 1 }, { unique: true });

module.exports = mongoose.model('Customer', CustomerSchema);
