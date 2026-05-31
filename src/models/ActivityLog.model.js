const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
  garage_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'Garage' },
  user_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action:     { type: String, required: true },
  meta:       { type: mongoose.Schema.Types.Mixed },
  created_at: { type: Date, default: Date.now },
});

ActivityLogSchema.index({ created_at: -1 });
ActivityLogSchema.index({ garage_id: 1, created_at: -1 });

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
