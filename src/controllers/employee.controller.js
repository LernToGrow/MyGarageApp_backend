const User = require('../models/User.model');
const Job  = require('../models/Job.model');

const ALL_PERMISSIONS = [
  'add_job', 'edit_job', 'delete_job',
  'add_inventory', 'edit_inventory',
  'view_billing', 'add_billing',
  'add_employee', 'edit_employee',
  'view_reports', 'manage_customers',
];

// GET /api/employees
async function listEmployees(req, res) {
  try {
    const employees = await User.find({
      garage_id: req.user.garage_id,
      role:      'employee',
    }).select('-__v').sort({ created_at: -1 });

    res.json({ employees });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// POST /api/employees/invite
async function inviteEmployee(req, res) {
  try {
    const { phone, name, permissions } = req.body;
    const garage_id = req.user.garage_id;

    if (!phone || !name) {
      res.status(400).json({ error: 'phone and name are required', code: 'PHONE_NAME_REQUIRED' });
      return;
    }

    const existing = await User.findOne({ phone });
    if (existing) {
      res.status(409).json({ error: 'A user with this phone already exists', code: 'EMPLOYEE_PHONE_DUPLICATE' });
      return;
    }

    // Validate permissions list if provided
    const granted = Array.isArray(permissions)
      ? permissions.filter((p) => ALL_PERMISSIONS.includes(p))
      : ['add_job', 'edit_job', 'manage_customers'];

    const employee = await User.create({
      phone,
      name,
      role:       'employee',
      garage_id,
      permissions: granted,
      invited_by:  req.user._id,
    });

    res.status(201).json({ employee });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// PATCH /api/employees/:id/permissions
async function updatePermissions(req, res) {
  try {
    const { permissions } = req.body;

    if (!Array.isArray(permissions)) {
      res.status(400).json({ error: 'permissions must be an array', code: 'PERMISSIONS_ARRAY_REQUIRED' });
      return;
    }

    const invalid = permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
    if (invalid.length > 0) {
      res.status(400).json({ error: `Invalid permissions: ${invalid.join(', ')}`, code: 'PERMISSIONS_INVALID' });
      return;
    }

    const employee = await User.findOneAndUpdate(
      { _id: req.params.id, garage_id: req.user.garage_id, role: 'employee' },
      { permissions },
      { returnDocument: 'after' }
    );

    if (!employee) {
      res.status(404).json({ error: 'Employee not found', code: 'EMPLOYEE_NOT_FOUND' });
      return;
    }

    res.json({ employee });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// PATCH /api/employees/:id/deactivate
async function deactivateEmployee(req, res) {
  try {
    const employee = await User.findOneAndUpdate(
      { _id: req.params.id, garage_id: req.user.garage_id, role: 'employee' },
      { is_active: false },
      { returnDocument: 'after' }
    );

    if (!employee) {
      res.status(404).json({ error: 'Employee not found', code: 'EMPLOYEE_NOT_FOUND' });
      return;
    }

    res.json({ employee, message: 'Employee deactivated' });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// GET /api/employees/:id/performance?period=today|week|month
async function getPerformance(req, res) {
  try {
    const { period = 'month' } = req.query;
    const garage_id = req.user.garage_id;

    const employee = await User.findOne({
      _id:      req.params.id,
      garage_id,
      role:     'employee',
    }).select('name phone');

    if (!employee) {
      res.status(404).json({ error: 'Employee not found', code: 'EMPLOYEE_NOT_FOUND' });
      return;
    }

    // Build date range for the period
    const now   = new Date();
    const start = new Date();
    if (period === 'today') {
      start.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      start.setDate(now.getDate() - 7);
    } else {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    }

    const jobs = await Job.find({
      garage_id,
      assigned_to: employee._id,
      status:      { $in: ['done', 'paid', 'closed'] },
      end_time:    { $gte: start, $lte: now },
    });

    const jobs_completed        = jobs.length;
    const total_duration        = jobs.reduce((s, j) => s + (j.duration_minutes || 0), 0);
    const avg_duration_minutes  = jobs_completed ? Math.round(total_duration / jobs_completed) : 0;
    const total_revenue_generated = jobs.reduce((s, j) => s + (j.total_amount || 0), 0);

    const on_time_count = jobs.filter(
      (j) => j.estimated_ready_at && j.end_time && j.end_time <= j.estimated_ready_at
    ).length;
    const late_count  = jobs_completed - on_time_count;
    const on_time_rate = jobs_completed
      ? `${Math.round((on_time_count / jobs_completed) * 100)}%`
      : 'N/A';

    res.json({
      employee,
      period,
      jobs_completed,
      avg_duration_minutes,
      total_revenue_generated,
      on_time_count,
      late_count,
      on_time_rate,
    });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

module.exports = { listEmployees, inviteEmployee, updatePermissions, deactivateEmployee, getPerformance };
