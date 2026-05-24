const mongoose = require('mongoose');

const BikeSchema = new mongoose.Schema({
  garage_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Garage', required: true },
  customer_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  make:         { type: String, required: true },   // Honda, Bajaj, TVS
  model:        { type: String, required: true },   // Activa, Pulsar, Apache
  year:         { type: Number },
  plate_number: { type: String, required: true },   // MH12AB1234
  fuel_type:    { type: String, enum: ['petrol', 'diesel', 'electric'], default: 'petrol' },
  odometer:     { type: Number },                   // km — updated on each visit
  created_at:   { type: Date, default: Date.now },
});

module.exports = mongoose.model('Bike', BikeSchema);
