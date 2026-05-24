const Customer = require('../models/Customer.model');
const Bike     = require('../models/Bike.model');
const Job      = require('../models/Job.model');

// GET /api/customers
async function listCustomers(req, res) {
  try {
    const { search } = req.query;
    const garage_id  = req.user.garage_id;

    let query = { garage_id };

    if (search) {
      const bikes = await Bike.find({
        garage_id,
        plate_number: { $regex: search, $options: 'i' },
      }).select('customer_id');

      const customerIdsFromBikes = bikes.map((b) => b.customer_id);

      query = {
        garage_id,
        $or: [
          { name:  { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { _id:   { $in: customerIdsFromBikes } },
        ],
      };
    }

    const customers = await Customer.find(query)
      .populate('bikes', 'make model plate_number fuel_type year')
      .sort({ created_at: -1 })
      .limit(50);

    res.json({ customers });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// POST /api/customers
async function createCustomer(req, res) {
  try {
    const { name, phone, address, language } = req.body;
    const garage_id = req.user.garage_id;

    if (!name || !phone) {
      res.status(400).json({ error: 'name and phone are required', code: 'NAME_PHONE_REQUIRED' });
      return;
    }

    const existing = await Customer.findOne({ garage_id, phone });
    if (existing) {
      res.status(409).json({ error: 'Customer with this phone already exists', code: 'CUSTOMER_PHONE_DUPLICATE', customer: existing });
      return;
    }

    const customer = await Customer.create({
      garage_id,
      name,
      phone,
      address,
      language:   language || 'en',
      created_by: req.user._id,
    });

    res.status(201).json({ customer });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// GET /api/customers/:id
async function getCustomer(req, res) {
  try {
    const garage_id = req.user.garage_id;

    const customer = await Customer.findOne({ _id: req.params.id, garage_id })
      .populate('bikes');

    if (!customer) {
      res.status(404).json({ error: 'Customer not found', code: 'CUSTOMER_NOT_FOUND' });
      return;
    }

    const jobs = await Job.find({ garage_id, customer_id: customer._id })
      .select('job_number status bike_id total_amount payment_status created_at')
      .populate('bike_id', 'make model plate_number')
      .sort({ created_at: -1 })
      .limit(20);

    res.json({ customer, jobs });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// PATCH /api/customers/:id
async function updateCustomer(req, res) {
  try {
    const garage_id = req.user.garage_id;
    const { name, phone, address, language } = req.body;

    const allowed = ['en', 'mr', 'hi'];
    if (language && !allowed.includes(language)) {
      res.status(400).json({ error: 'Invalid language', code: 'LANGUAGE_INVALID' });
      return;
    }

    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, garage_id },
      { name, phone, address, language },
      { returnDocument: 'after', runValidators: true }
    );

    if (!customer) {
      res.status(404).json({ error: 'Customer not found', code: 'CUSTOMER_NOT_FOUND' });
      return;
    }

    res.json({ customer });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// POST /api/customers/:id/bikes
async function addBike(req, res) {
  try {
    const garage_id = req.user.garage_id;
    const { make, model, year, plate_number, fuel_type, odometer } = req.body;

    if (!make || !model || !plate_number) {
      res.status(400).json({ error: 'make, model, and plate_number are required', code: 'BIKE_FIELDS_REQUIRED' });
      return;
    }

    const customer = await Customer.findOne({ _id: req.params.id, garage_id });
    if (!customer) {
      res.status(404).json({ error: 'Customer not found', code: 'CUSTOMER_NOT_FOUND' });
      return;
    }

    const bike = await Bike.create({
      garage_id,
      customer_id:  customer._id,
      make,
      model,
      year,
      plate_number: plate_number.toUpperCase(),
      fuel_type:    fuel_type || 'petrol',
      odometer,
    });

    customer.bikes.push(bike._id);
    await customer.save();

    res.status(201).json({ bike });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// GET /api/customers/:id/bikes
async function listBikes(req, res) {
  try {
    const garage_id = req.user.garage_id;

    const customer = await Customer.findOne({ _id: req.params.id, garage_id });
    if (!customer) {
      res.status(404).json({ error: 'Customer not found', code: 'CUSTOMER_NOT_FOUND' });
      return;
    }

    const bikes = await Bike.find({ customer_id: customer._id, garage_id });
    res.json({ bikes });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

module.exports = { listCustomers, createCustomer, getCustomer, updateCustomer, addBike, listBikes };
