const mongoose = require('mongoose');

// Counter collection keeps a persistent incrementing sequence per garage
const CounterSchema = new mongoose.Schema({
  _id:     { type: String, required: true },  // e.g. "job_JC2024-GARAGEID"
  seq:     { type: Number, default: 0 },
});
const Counter = mongoose.models.Counter || mongoose.model('Counter', CounterSchema);

async function generateJobNumber(garage_id) {
  const key = `job_${garage_id}`;
  const counter = await Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `JC-${String(counter.seq).padStart(4, '0')}`;
}

module.exports = generateJobNumber;
