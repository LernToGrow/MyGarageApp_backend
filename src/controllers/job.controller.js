const Job      = require('../models/Job.model');
const Customer = require('../models/Customer.model');
const Bike     = require('../models/Bike.model');
const Part     = require('../models/Part.model');
const Invoice  = require('../models/Invoice.model');
const generateJobNumber     = require('../utils/generateJobNumber');
const generateInvoiceNumber = require('../utils/generateInvoiceNumber');
const calculateTotals       = require('../utils/calculateGST');

// Express 5 note: async handlers must NOT return res.* — Express 5 treats the
// resolved value of the async function as a potential "next" call.
// Pattern: res.json() / res.status().json() are called without `return`.
// Early exits use a guard variable (sent) or nested if/else.

// ─── Step 1: Create job ───────────────────────────────────────────────────────

// POST /api/jobs
async function createJob(req, res) {
  try {
    const garage_id = req.user.garage_id;
    const { customer_id, bike_id, odometer_in, assigned_to } = req.body;

    if (!customer_id || !bike_id) {
      res.status(400).json({ error: 'customer_id and bike_id are required', code: 'JOB_IDS_REQUIRED' });
      return;
    }

    const [customer, bike] = await Promise.all([
      Customer.findOne({ _id: customer_id, garage_id }),
      Bike.findOne({ _id: bike_id, garage_id }),
    ]);

    if (!customer) { res.status(404).json({ error: 'Customer not found', code: 'CUSTOMER_NOT_FOUND' }); return; }
    if (!bike)     { res.status(404).json({ error: 'Bike not found', code: 'BIKE_NOT_FOUND' });         return; }

    const job_number = await generateJobNumber(garage_id);

    const job = await Job.create({
      job_number,
      garage_id,
      customer_id,
      bike_id,
      odometer_in,
      assigned_to: assigned_to || req.user._id,
      created_by:  req.user._id,
      status:      'received',
    });

    res.status(201).json({ job });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// GET /api/jobs
async function listJobs(req, res) {
  try {
    const garage_id = req.user.garage_id;
    const { status, date, assigned_to, from, to } = req.query;

    const query = { garage_id };
    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      query.status = statuses.length === 1 ? statuses[0] : { $in: statuses };
    }
    if (assigned_to) query.assigned_to = assigned_to;

    if (date) {
      const start = new Date(date);
      const end   = new Date(date);
      end.setDate(end.getDate() + 1);
      query.created_at = { $gte: start, $lt: end };
    } else if (from || to) {
      query.created_at = {};
      if (from) {
        const f = new Date(from);
        f.setHours(0, 0, 0, 0);
        query.created_at.$gte = f;
      }
      if (to) {
        const t2 = new Date(to);
        t2.setHours(23, 59, 59, 999);
        query.created_at.$lte = t2;
      }
    }

    const jobs = await Job.find(query)
      .populate('customer_id', 'name phone')
      .populate('bike_id', 'make model plate_number')
      .populate('assigned_to', 'name')
      .sort({ created_at: -1 })
      .limit(100);

    res.json({ jobs });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// GET /api/jobs/:id
async function getJob(req, res) {
  try {
    const job = await Job.findOne({ _id: req.params.id, garage_id: req.user.garage_id })
      .populate('customer_id', 'name phone address language')
      .populate('bike_id')
      .populate('assigned_to', 'name phone')
      .populate('parts_used.part_id', 'name_en brand');

    if (!job) { res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' }); return; }

    const invoice = await Invoice.findOne({ job_id: job._id });
    res.json({ job, invoice: invoice || null });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// ─── Step 2: Inspection ───────────────────────────────────────────────────────

// PATCH /api/jobs/:id/inspection
async function saveInspection(req, res) {
  try {
    const { inspection_notes } = req.body;

    if (!inspection_notes || !inspection_notes.trim()) {
      res.status(400).json({ error: 'inspection_notes is required', code: 'INSPECTION_NOTES_REQUIRED' });
      return;
    }

    const job = await Job.findOneAndUpdate(
      { _id: req.params.id, garage_id: req.user.garage_id },
      {
        inspection_notes,
        inspection_done_at: new Date(),
        status:             'inspecting',
      },
      { returnDocument: 'after' }
    )
      .populate('customer_id', 'name phone language')
      .populate('bike_id', 'make model plate_number');

    if (!job) { res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' }); return; }
    res.json({ job });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// ─── Step 3: Estimate time ────────────────────────────────────────────────────

// PATCH /api/jobs/:id/estimate
async function setEstimate(req, res) {
  try {
    const { estimated_ready_at } = req.body;

    if (!estimated_ready_at) {
      res.status(400).json({ error: 'estimated_ready_at is required', code: 'ESTIMATE_DATE_REQUIRED' });
      return;
    }

    const job = await Job.findOne({ _id: req.params.id, garage_id: req.user.garage_id })
      .populate('customer_id', 'name phone language')
      .populate('bike_id', 'make model plate_number');

    if (!job) { res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' }); return; }

    const isUpdate = !!job.estimated_ready_at;

    job.estimated_ready_at = new Date(estimated_ready_at);
    if (isUpdate) job.estimate_updated_at = new Date();
    job.status = 'estimated';
    await job.save();

    res.json({ job });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// Populate bike/customer on a job doc after save (for consistent mobile store updates)
async function populateJob(job) {
  return job.populate([
    { path: 'customer_id', select: 'name phone language' },
    { path: 'bike_id',     select: 'make model plate_number' },
    { path: 'assigned_to', select: 'name' },
  ]);
}

// ─── Step 4: Start job ────────────────────────────────────────────────────────

// PATCH /api/jobs/:id/start
async function startJob(req, res) {
  try {
    const job = await Job.findOneAndUpdate(
      { _id: req.params.id, garage_id: req.user.garage_id },
      { start_time: new Date(), status: 'in_progress' },
      { returnDocument: 'after' }
    )
      .populate('customer_id', 'name phone language')
      .populate('bike_id', 'make model plate_number')
      .populate('assigned_to', 'name');

    if (!job) { res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' }); return; }
    res.json({ job });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// ─── Step 4a: Services ────────────────────────────────────────────────────────

// POST /api/jobs/:id/services
async function addServices(req, res) {
  try {
    const { services } = req.body;

    if (!Array.isArray(services) || services.length === 0) {
      res.status(400).json({ error: 'services must be a non-empty array', code: 'SERVICES_ARRAY_REQUIRED' });
      return;
    }

    const job = await Job.findOne({ _id: req.params.id, garage_id: req.user.garage_id });
    if (!job) { res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' }); return; }

    services.forEach(({ name, labour_charge }) => {
      if (name && labour_charge != null) {
        job.services.push({ name, labour_charge });
      }
    });

    const totals = calculateTotals(job.services, job.parts_used);
    Object.assign(job, totals);
    await job.save();
    await populateJob(job);

    res.json({ job });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// PATCH /api/jobs/:id/services/:svcId  — toggles done/undone
async function markServiceDone(req, res) {
  try {
    const job = await Job.findOne({ _id: req.params.id, garage_id: req.user.garage_id });
    if (!job) { res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' }); return; }

    const svc = job.services.id(req.params.svcId);
    if (!svc) { res.status(404).json({ error: 'Service not found', code: 'SERVICE_NOT_FOUND' }); return; }

    svc.is_done = !svc.is_done;
    svc.done_at = svc.is_done ? new Date() : undefined;
    await job.save();
    await populateJob(job);

    res.json({ job });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// DELETE /api/jobs/:id/services/:svcId
async function removeService(req, res) {
  try {
    const job = await Job.findOne({ _id: req.params.id, garage_id: req.user.garage_id });
    if (!job) { res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' }); return; }

    const svc = job.services.id(req.params.svcId);
    if (!svc) { res.status(404).json({ error: 'Service not found', code: 'SERVICE_NOT_FOUND' }); return; }

    svc.deleteOne();
    const totals = calculateTotals(job.services, job.parts_used);
    Object.assign(job, totals);
    await job.save();
    await populateJob(job);

    res.json({ job });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// ─── Step 4b: Parts ───────────────────────────────────────────────────────────

// POST /api/jobs/:id/parts
async function addPart(req, res) {
  try {
    const garage_id = req.user.garage_id;
    const { part_id, name, quantity, unit_price, source_type, vendor_name, notes } = req.body;

    if (!source_type) {
      res.status(400).json({ error: 'source_type is required', code: 'PART_SOURCE_REQUIRED' });
      return;
    }
    if (!name || quantity == null) {
      res.status(400).json({ error: 'name and quantity are required', code: 'PART_NAME_QTY_REQUIRED' });
      return;
    }

    const job = await Job.findOne({ _id: req.params.id, garage_id });
    if (!job) { res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' }); return; }

    let resolvedName      = name;
    let resolvedUnitPrice = unit_price || 0;
    let lowStockWarning   = null;

    if (source_type === 'own_stock') {
      if (!part_id) { res.status(400).json({ error: 'part_id required for own_stock', code: 'PART_ID_REQUIRED' }); return; }

      const part = await Part.findOne({ _id: part_id, garage_id, is_active: true });
      if (!part) { res.status(404).json({ error: 'Part not found in inventory', code: 'PART_NOT_IN_INVENTORY' }); return; }
      if (part.quantity < quantity) {
        res.status(400).json({ error: `Insufficient stock. Available: ${part.quantity}, requested: ${quantity}`, code: 'INSUFFICIENT_STOCK' });
        return;
      }

      resolvedName      = part.name_en;
      resolvedUnitPrice = part.sell_price;
      part.quantity    -= quantity;
      await part.save();

      if (part.quantity < part.min_quantity) {
        lowStockWarning = `Stock for "${part.name_en}" is now ${part.quantity} (below minimum ${part.min_quantity})`;
      }
    }

    if (source_type === 'customer_supplied') resolvedUnitPrice = 0;

    const total_price = source_type === 'customer_supplied' ? 0 : resolvedUnitPrice * quantity;

    job.parts_used.push({
      part_id:    source_type === 'own_stock' ? part_id : undefined,
      name:       resolvedName,
      quantity,
      unit_price: resolvedUnitPrice,
      total_price,
      source_type,
      vendor_name,
      notes,
    });

    const totals = calculateTotals(job.services, job.parts_used);
    Object.assign(job, totals);
    await job.save();
    await populateJob(job);

    res.json({ job, low_stock_warning: lowStockWarning || undefined });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// DELETE /api/jobs/:id/parts/:partIndex
async function removePart(req, res) {
  try {
    const job = await Job.findOne({ _id: req.params.id, garage_id: req.user.garage_id });
    if (!job) { res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' }); return; }

    const idx = parseInt(req.params.partIndex);
    if (isNaN(idx) || idx < 0 || idx >= job.parts_used.length) {
      res.status(404).json({ error: 'Part not found', code: 'PART_NOT_FOUND' }); return;
    }

    const removed = job.parts_used[idx];

    // Restore own_stock quantity if it came from inventory
    if (removed.source_type === 'own_stock' && removed.part_id) {
      const Part = require('../models/Part.model');
      await Part.findByIdAndUpdate(removed.part_id, { $inc: { quantity: removed.quantity } });
    }

    job.parts_used.splice(idx, 1);
    const totals = calculateTotals(job.services, job.parts_used);
    Object.assign(job, totals);
    await job.save();
    await populateJob(job);

    res.json({ job });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// ─── Step 5: Complete job ─────────────────────────────────────────────────────

// PATCH /api/jobs/:id/complete
async function completeJob(req, res) {
  try {
    const { mechanic_notes } = req.body || {};

    const job = await Job.findOne({ _id: req.params.id, garage_id: req.user.garage_id })
      .populate('customer_id', 'name phone language')
      .populate('bike_id', 'make model plate_number');

    if (!job) { res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' }); return; }

    const end_time = new Date();
    job.end_time = end_time;
    job.status   = 'done';
    if (mechanic_notes) job.mechanic_notes = mechanic_notes;
    if (job.start_time) job.duration_minutes = Math.round((end_time - job.start_time) / 60000);

    const totals = calculateTotals(job.services, job.parts_used);
    Object.assign(job, totals);
    await job.save();

    res.json({ job });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// ─── Step 6: Payment + invoice ────────────────────────────────────────────────

// POST /api/jobs/:id/payment
async function recordPayment(req, res) {
  try {
    const garage_id = req.user.garage_id;
    const { payment_mode, amount_paid } = req.body;

    if (!payment_mode || !['cash', 'online', 'upi'].includes(payment_mode)) {
      res.status(400).json({ error: 'payment_mode must be cash or online', code: 'PAYMENT_MODE_INVALID' });
      return;
    }
    if (amount_paid == null || amount_paid < 0) {
      res.status(400).json({ error: 'amount_paid is required', code: 'AMOUNT_REQUIRED' });
      return;
    }

    const job = await Job.findOne({ _id: req.params.id, garage_id })
      .populate('customer_id', 'name phone language')
      .populate('bike_id', 'make model plate_number');

    if (!job) { res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' }); return; }

    const previously_paid = job.amount_paid || 0;
    const total_paid      = previously_paid + amount_paid;
    const balance_due     = Math.max(0, job.total_amount - total_paid);
    const payment_status  = balance_due === 0 ? 'paid' : 'partial';

    job.payment_mode   = payment_mode;
    job.amount_paid    = total_paid;
    job.balance_due    = balance_due;
    job.payment_status = payment_status;
    job.status         = payment_status === 'paid' ? 'paid' : 'done';
    if (payment_status === 'paid') job.paid_at = new Date();
    await job.save();

    const lineItems = [
      ...job.services.map((s) => ({ name: s.name, amount: s.labour_charge, item_type: 'service' })),
      ...job.parts_used.map((p) => ({
        name:      `${p.name} (${p.source_type.replace(/_/g, ' ')})`,
        amount:    p.total_price,
        item_type: 'part',
      })),
    ];

    const pdfService        = require('../services/pdf.service');
    const cloudinaryService = require('../services/cloudinary.service');

    // Reuse existing invoice if one already exists for this job
    let invoice = await Invoice.findOne({ job_id: job._id });

    if (invoice) {
      invoice.amount_paid    = total_paid;
      invoice.balance_due    = balance_due;
      invoice.payment_status = payment_status;
      invoice.payment_mode   = payment_mode;
      if (job.paid_at) invoice.paid_at = job.paid_at;
      await invoice.save();
    } else {
      const invoice_number = await generateInvoiceNumber(garage_id);
      let pdf_url = null;
      try {
        const pdfBuffer = await pdfService.generateInvoicePDF({ job, invoice_number });
        pdf_url = await cloudinaryService.uploadPDF(pdfBuffer, invoice_number);
      } catch (_) { /* PDF failure does not block payment */ }

      invoice = await Invoice.create({
        invoice_number,
        garage_id,
        job_id:         job._id,
        customer_id:    job.customer_id._id,
        line_items:     lineItems,
        subtotal:       job.subtotal,
        gst_rate:       18,
        gst_amount:     job.gst_amount,
        total_amount:   job.total_amount,
        payment_mode,
        amount_paid:    total_paid,
        balance_due,
        payment_status,
        pdf_url,
        paid_at:        job.paid_at,
      });
    }

    res.status(201).json({ job, invoice });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// ─── Invoice fetch ────────────────────────────────────────────────────────────

// GET /api/jobs/:id/invoice
async function getInvoice(req, res) {
  try {
    const job = await Job.findOne({ _id: req.params.id, garage_id: req.user.garage_id });
    if (!job) { res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' }); return; }

    const invoice = await Invoice.findOne({ job_id: job._id });
    if (!invoice) { res.status(404).json({ error: 'Invoice not found', code: 'INVOICE_NOT_FOUND' }); return; }

    res.json({ invoice });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// GET /api/jobs/:id/invoice/pdf
async function getInvoicePdf(req, res) {
  try {
    const Garage = require('../models/Garage.model');

    const job = await Job.findOne({ _id: req.params.id, garage_id: req.user.garage_id })
      .populate('customer_id', 'name phone address')
      .populate('bike_id', 'make model year plate_number fuel_type odometer')
      .populate('assigned_to', 'name phone');

    if (!job) { res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' }); return; }

    const invoice = await Invoice.findOne({ job_id: job._id });
    if (!invoice) { res.status(404).json({ error: 'Invoice not found', code: 'INVOICE_NOT_FOUND' }); return; }

    if (invoice.pdf_url) {
      res.redirect(invoice.pdf_url);
      return;
    }

    const garage    = await Garage.findById(job.garage_id);
    const pdfService = require('../services/pdf.service');
    const pdfBuffer  = await pdfService.generateInvoicePDF({ job, invoice_number: invoice.invoice_number, garage });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invoice.invoice_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// DELETE /api/jobs/:id
async function deleteJob(req, res) {
  try {
    const job = await Job.findOne({ _id: req.params.id, garage_id: req.user.garage_id });
    if (!job) { res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' }); return; }
    if (job.status !== 'received') {
      res.status(400).json({ error: 'Only jobs in received status can be deleted', code: 'JOB_NOT_DELETABLE' });
      return;
    }
    await Invoice.deleteMany({ job_id: job._id });
    await Job.deleteOne({ _id: job._id });
    res.json({ message: 'Job deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

module.exports = {
  createJob, listJobs, getJob,
  saveInspection,
  setEstimate,
  startJob,
  addServices, markServiceDone, removeService,
  removePart,
  addPart,
  completeJob,
  recordPayment,
  getInvoice, getInvoicePdf,
  deleteJob,
};
