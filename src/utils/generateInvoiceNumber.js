const mongoose = require('mongoose');

const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});
const Counter = mongoose.models.Counter || mongoose.model('Counter', CounterSchema);

async function generateInvoiceNumber(garage_id) {
  const key = `invoice_${garage_id}`;
  const counter = await Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `INV-${String(counter.seq).padStart(4, '0')}`;
}

module.exports = generateInvoiceNumber;
