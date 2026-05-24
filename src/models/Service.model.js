const mongoose = require('mongoose');

const ServiceSchema = new mongoose.Schema({
  garage_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'Garage', required: true },
  name:          { type: String, required: true },
  default_charge: { type: Number, default: 0 },
  category:      { type: String },
  is_active:     { type: Boolean, default: true },
  created_at:    { type: Date, default: Date.now },
  updated_at:    { type: Date, default: Date.now },
});

ServiceSchema.pre('save', function () { this.updated_at = new Date(); });
ServiceSchema.pre('findOneAndUpdate', function () { this.set({ updated_at: new Date() }); });

module.exports = mongoose.model('ServiceCatalog', ServiceSchema);
