const Part = require('../models/Part.model');

// GET /api/parts
async function listParts(req, res) {
  try {
    const garage_id = req.user.garage_id;
    const { category, stock } = req.query;

    const query = { garage_id, is_active: true };
    if (category) query.category = { $regex: category, $options: 'i' };
    if (stock === 'low') query.$expr = { $lt: ['$quantity', '$min_quantity'] };

    const parts = await Part.find(query).sort({ name_en: 1 });
    res.json({ parts });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// GET /api/parts/low-stock
async function getLowStock(req, res) {
  try {
    const parts = await Part.find({
      garage_id:  req.user.garage_id,
      is_active:  true,
      $expr:      { $lt: ['$quantity', '$min_quantity'] },
    }).sort({ quantity: 1 });

    res.json({ parts, count: parts.length });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// POST /api/parts
async function createPart(req, res) {
  try {
    const garage_id = req.user.garage_id;
    const {
      name_en, name_mr, name_hi, brand, category, sku,
      quantity, min_quantity, sell_price, buy_price,
      vendor_name, vendor_phone,
    } = req.body;

    if (!name_en || sell_price == null) {
      res.status(400).json({ error: 'name_en and sell_price are required', code: 'PART_FIELDS_REQUIRED' });
      return;
    }

    const part = await Part.create({
      garage_id,
      name_en, name_mr, name_hi,
      brand, category, sku,
      quantity:     quantity     ?? 0,
      min_quantity: min_quantity ?? 2,
      sell_price,
      buy_price,
      vendor_name,
      vendor_phone,
    });

    res.status(201).json({ part });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// PATCH /api/parts/:id
async function updatePart(req, res) {
  try {
    const {
      name_en, name_mr, name_hi, brand, category, sku,
      sell_price, buy_price, min_quantity, vendor_name, vendor_phone, is_active,
    } = req.body;

    const part = await Part.findOneAndUpdate(
      { _id: req.params.id, garage_id: req.user.garage_id },
      { name_en, name_mr, name_hi, brand, category, sku, sell_price, buy_price, min_quantity, vendor_name, vendor_phone, is_active },
      { returnDocument: 'after', runValidators: true }
    );

    if (!part) {
      res.status(404).json({ error: 'Part not found', code: 'PART_NOT_FOUND' });
      return;
    }

    res.json({ part });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// PATCH /api/parts/:id/stock
// Manual stock adjustment — restock, correction, or write-off
async function adjustStock(req, res) {
  try {
    const { adjustment, reason } = req.body;
    // adjustment: positive = restock, negative = write-off

    if (adjustment == null || typeof adjustment !== 'number') {
      res.status(400).json({ error: 'adjustment (number) is required', code: 'ADJUSTMENT_REQUIRED' });
      return;
    }

    const part = await Part.findOne({ _id: req.params.id, garage_id: req.user.garage_id });
    if (!part) {
      res.status(404).json({ error: 'Part not found', code: 'PART_NOT_FOUND' });
      return;
    }

    const newQuantity = part.quantity + adjustment;
    if (newQuantity < 0) {
      res.status(400).json({ error: `Adjustment would result in negative stock (current: ${part.quantity})`, code: 'NEGATIVE_STOCK' });
      return;
    }

    part.quantity = newQuantity;
    await part.save();

    const isLowStock = part.quantity < part.min_quantity;
    res.json({
      part,
      low_stock_warning: isLowStock
        ? `Stock is now ${part.quantity} — below minimum ${part.min_quantity}`
        : undefined,
    });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

module.exports = { listParts, getLowStock, createPart, updatePart, adjustStock };
