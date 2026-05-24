const Service = require('../models/Service.model');

// GET /api/services
async function listServices(req, res) {
  try {
    const services = await Service.find({ garage_id: req.user.garage_id, is_active: true }).sort({ name: 1 });
    res.json({ services });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/services
async function createService(req, res) {
  try {
    const { name, default_charge, category } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const service = await Service.create({
      garage_id:      req.user.garage_id,
      name:           name.trim(),
      default_charge: default_charge || 0,
      category:       category || '',
    });
    res.status(201).json({ service });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PATCH /api/services/:id
async function updateService(req, res) {
  try {
    const { name, default_charge, category, is_active } = req.body;
    const service = await Service.findOneAndUpdate(
      { _id: req.params.id, garage_id: req.user.garage_id },
      { name, default_charge, category, is_active },
      { returnDocument: 'after', runValidators: true }
    );
    if (!service) { res.status(404).json({ error: 'Service not found' }); return; }
    res.json({ service });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { listServices, createService, updateService };
