const mongoose = require('mongoose');

const InvoiceSchema = new mongoose.Schema({
  invoice_number: { type: String, unique: true },
  garage_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'Garage', required: true },
  job_id:         { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  customer_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  line_items:     [new mongoose.Schema({ name: String, amount: Number, item_type: String }, { _id: false })],
  subtotal:       { type: Number, required: true },
  gst_rate:       { type: Number, default: 18 },
  gst_amount:     { type: Number, required: true },
  total_amount:   { type: Number, required: true },
  payment_mode:   { type: String, enum: ['cash', 'online'] },
  amount_paid:    { type: Number, default: 0 },
  balance_due:    { type: Number, default: 0 },
  payment_status: { type: String, enum: ['pending', 'partial', 'paid'], default: 'pending' },
  pdf_url:        { type: String },
  paid_at:        { type: Date },
  created_at:     { type: Date, default: Date.now },
});

module.exports = mongoose.model('Invoice', InvoiceSchema);
