const mongoose = require('mongoose');

const PartUsedSchema = new mongoose.Schema({
  part_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'Part' },
  name:        { type: String, required: true },
  quantity:    { type: Number, required: true },
  unit_price:  { type: Number, required: true },
  total_price: { type: Number, required: true },
  source_type: {
    type: String,
    enum: ['own_stock', 'outsourced', 'customer_supplied', 'external_purchase'],
    required: true,
  },
  vendor_name: { type: String },
  notes:       { type: String },
});

const ServiceSchema = new mongoose.Schema({
  name:          { type: String, required: true },
  labour_charge: { type: Number, required: true },
  is_done:       { type: Boolean, default: false },
  done_at:       { type: Date },
});

const JobSchema = new mongoose.Schema({
  job_number:   { type: String, unique: true },
  garage_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Garage', required: true },
  customer_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  bike_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'Bike', required: true },
  assigned_to:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  status: {
    type: String,
    enum: ['received', 'inspecting', 'estimated', 'in_progress', 'done', 'paid', 'closed'],
    default: 'received',
  },

  // Inspection
  inspection_notes:   { type: String },
  inspection_photos:  [{ type: String }],
  inspection_done_at: { type: Date },

  // Estimate time
  estimated_duration:  { type: String },
  estimated_ready_at:  { type: Date },
  estimate_updated_at: { type: Date },

  // Job timing
  start_time:        { type: Date },
  end_time:          { type: Date },
  duration_minutes:  { type: Number },

  // Services and parts
  services:    [ServiceSchema],
  parts_used:  [PartUsedSchema],

  mechanic_notes: { type: String },
  odometer_in:    { type: Number },

  // Totals
  subtotal:     { type: Number, default: 0 },
  gst_amount:   { type: Number, default: 0 },
  total_amount: { type: Number, default: 0 },

  // Payment
  payment_status: { type: String, enum: ['pending', 'partial', 'paid'], default: 'pending' },
  payment_mode:   { type: String, enum: ['cash', 'online'] },
  amount_paid:    { type: Number, default: 0 },
  balance_due:    { type: Number, default: 0 },
  paid_at:        { type: Date },
  collected_by:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  remitted_to_admin: { type: Boolean, default: false },
  remitted_at:       { type: Date },

  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// Auto-update updated_at on every save (Mongoose 9: no next() callback)
JobSchema.pre('save', function () {
  this.updated_at = new Date();
});

JobSchema.pre('findOneAndUpdate', function () {
  this.set({ updated_at: new Date() });
});

module.exports = mongoose.model('Job', JobSchema);
