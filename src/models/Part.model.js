const mongoose = require('mongoose');

const PartSchema = new mongoose.Schema({
  garage_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Garage', required: true },
  name_en:      { type: String, required: true },
  name_mr:      { type: String },
  name_hi:      { type: String },
  brand:        { type: String },
  category:     { type: String },   // engine, brakes, electrical, tyres, etc.
  sku:          { type: String },
  image_url:    { type: String },
  quantity:     { type: Number, default: 0 },
  min_quantity: { type: Number, default: 2 },
  sell_price:   { type: Number, required: true },
  buy_price:    { type: Number },
  vendor_name:  { type: String },
  vendor_phone: { type: String },
  is_active:    { type: Boolean, default: true },
  created_at:   { type: Date, default: Date.now },
});

module.exports = mongoose.model('Part', PartSchema);
