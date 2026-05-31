const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User.model');
const Garage = require('../models/Garage.model');
const Job = require('../models/Job.model');
const Customer = require('../models/Customer.model');
const Part = require('../models/Part.model');
const Invoice = require('../models/Invoice.model');
const ActivityLog = require('../models/ActivityLog.model');
const ServiceCatalog = require('../models/Service.model');

// GET /api/admin/stats
async function getPlatformStats(req, res) {
  const [
    totalGarages,
    activeGarages,
    totalUsers,
    totalJobs,
    revenueAgg,
  ] = await Promise.all([
    Garage.countDocuments(),
    Garage.countDocuments({ is_active: true }),
    User.countDocuments({ role: { $ne: 'super_admin' } }),
    Job.countDocuments(),
    Invoice.aggregate([
      { $group: { _id: null, revenue: { $sum: '$total_amount' }, gst: { $sum: '$gst_amount' } } },
    ]),
  ]);

  const revenue = revenueAgg[0] || { revenue: 0, gst: 0 };

  // New signups per day (last 30 days)
  const since = new Date();
  since.setDate(since.getDate() - 29);
  const signups = await Garage.aggregate([
    { $match: { created_at: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.json({
    total_garages: totalGarages,
    active_garages: activeGarages,
    inactive_garages: totalGarages - activeGarages,
    total_users: totalUsers,
    total_jobs: totalJobs,
    total_revenue: revenue.revenue,
    total_gst: revenue.gst,
    signups_last_30_days: signups,
  });
}

// GET /api/admin/garages
async function listGarages(req, res) {
  const { search, state, district, taluka, plan, is_active, page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  const filter = {};
  if (search) filter.$text = { $search: search };
  if (state) filter.state = state;
  if (district) filter.district = district;
  if (taluka) filter.taluka = taluka;
  if (plan) filter.plan = plan;
  if (is_active !== undefined) filter.is_active = is_active === 'true';

  const [garages, total] = await Promise.all([
    Garage.aggregate([
      { $match: filter },
      { $sort: { created_at: -1 } },
      { $skip: skip },
      { $limit: Number(limit) },
      {
        $lookup: {
          from: 'users', localField: 'owner_id', foreignField: '_id',
          as: 'owner', pipeline: [{ $project: { name: 1, phone: 1 } }],
        },
      },
      { $unwind: { path: '$owner', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'jobs', localField: '_id', foreignField: 'garage_id',
          as: 'jobs', pipeline: [{ $count: 'n' }],
        },
      },
      {
        $lookup: {
          from: 'users', localField: '_id', foreignField: 'garage_id',
          as: 'employees',
          pipeline: [{ $match: { role: 'employee' } }, { $count: 'n' }],
        },
      },
      {
        $addFields: {
          owner_id: '$owner',
          job_count: { $ifNull: [{ $arrayElemAt: ['$jobs.n', 0] }, 0] },
          employee_count: { $ifNull: [{ $arrayElemAt: ['$employees.n', 0] }, 0] },
        },
      },
      { $project: { jobs: 0, employees: 0, owner: 0 } },
    ]),
    Garage.countDocuments(filter),
  ]);

  res.json({ data: garages, total, page: Number(page), limit: Number(limit) });
}

// GET /api/admin/garages/:id
async function getGarage(req, res) {
  const garage = await Garage.findById(req.params.id).populate('owner_id', 'name phone is_active').lean();
  if (!garage) return res.status(404).json({ error: 'Garage not found' });

  const [jobCount, customerCount, employeeCount, revenue] = await Promise.all([
    Job.countDocuments({ garage_id: garage._id }),
    Customer.countDocuments({ garage_id: garage._id }),
    User.countDocuments({ garage_id: garage._id, role: 'employee' }),
    Invoice.aggregate([
      { $match: { garage_id: garage._id } },
      { $group: { _id: null, total: { $sum: '$total_amount' }, gst: { $sum: '$gst_amount' } } },
    ]),
  ]);

  res.json({
    ...garage,
    job_count: jobCount,
    customer_count: customerCount,
    employee_count: employeeCount,
    total_revenue: revenue[0]?.total || 0,
    total_gst: revenue[0]?.gst || 0,
  });
}

// GET /api/admin/garages/:id/users
async function getGarageUsers(req, res) {
  const users = await User.find({ garage_id: req.params.id })
    .select('-password_hash -reset_token -reset_token_expires')
    .lean();
  res.json(users);
}

// GET /api/admin/garages/:id/jobs
async function getGarageJobs(req, res) {
  const { page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;
  const [jobs, total] = await Promise.all([
    Job.find({ garage_id: req.params.id })
      .populate('customer_id', 'name phone')
      .populate('assigned_to', 'name')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Job.countDocuments({ garage_id: req.params.id }),
  ]);
  res.json({ data: jobs, total, page: Number(page), limit: Number(limit) });
}

// GET /api/admin/garages/:id/customers
async function getGarageCustomers(req, res) {
  const customers = await Customer.find({ garage_id: req.params.id }).lean();
  res.json(customers);
}

// GET /api/admin/garages/:id/parts
async function getGarageParts(req, res) {
  const parts = await Part.find({ garage_id: req.params.id }).lean();
  res.json(parts);
}

// PATCH /api/admin/garages/:id/activate
async function toggleGarageActive(req, res) {
  const garage = await Garage.findById(req.params.id);
  if (!garage) return res.status(404).json({ error: 'Garage not found' });
  garage.is_active = !garage.is_active;
  await garage.save();

  await ActivityLog.create({
    user_id: req.user._id,
    garage_id: garage._id,
    action: garage.is_active ? 'garage_activated' : 'garage_deactivated',
    meta: { garage_name: garage.name },
  });

  res.json({ is_active: garage.is_active });
}

// PATCH /api/admin/garages/:id/plan
async function updateGaragePlan(req, res) {
  const { plan, plan_expires_at } = req.body;
  const garage = await Garage.findByIdAndUpdate(
    req.params.id,
    { plan, plan_expires_at },
    { new: true, runValidators: true }
  );
  if (!garage) return res.status(404).json({ error: 'Garage not found' });

  await ActivityLog.create({
    user_id: req.user._id,
    garage_id: garage._id,
    action: 'plan_updated',
    meta: { plan, plan_expires_at },
  });

  res.json({ plan: garage.plan, plan_expires_at: garage.plan_expires_at });
}

// GET /api/admin/users
async function listUsers(req, res) {
  const { role, search, page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  const filter = { role: { $ne: 'super_admin' } };
  if (role) filter.role = role;
  if (search) filter.$or = [
    { name: { $regex: search, $options: 'i' } },
    { phone: { $regex: search, $options: 'i' } },
  ];

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('-password_hash -reset_token -reset_token_expires')
      .populate('garage_id', 'name city')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    User.countDocuments(filter),
  ]);

  res.json({ data: users, total, page: Number(page), limit: Number(limit) });
}

// PATCH /api/admin/users/:id/activate
async function toggleUserActive(req, res) {
  const user = await User.findById(req.params.id);
  if (!user || user.role === 'super_admin') return res.status(404).json({ error: 'User not found' });
  user.is_active = !user.is_active;
  await user.save();

  await ActivityLog.create({
    user_id: req.user._id,
    garage_id: user.garage_id,
    action: user.is_active ? 'user_activated' : 'user_deactivated',
    meta: { target_user_id: user._id, name: user.name },
  });

  res.json({ is_active: user.is_active });
}

// POST /api/admin/users/:id/reset-password
async function resetUserPassword(req, res) {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const user = await User.findById(req.params.id);
  if (!user || user.role === 'super_admin') return res.status(404).json({ error: 'User not found' });

  user.password_hash = await bcrypt.hash(new_password, 10);
  user.reset_token = undefined;
  user.reset_token_expires = undefined;
  await user.save();

  await ActivityLog.create({
    user_id: req.user._id,
    garage_id: user.garage_id,
    action: 'password_reset_by_admin',
    meta: { target_user_id: user._id },
  });

  res.json({ message: 'Password reset successfully' });
}

// GET /api/admin/analytics/revenue
async function revenueAnalytics(req, res) {
  const { months = 6 } = req.query;
  const since = new Date();
  since.setMonth(since.getMonth() - Number(months));

  const [perGarage, monthly, gstTotal] = await Promise.all([
    Invoice.aggregate([
      { $match: { created_at: { $gte: since } } },
      {
        $group: {
          _id: '$garage_id',
          revenue: { $sum: '$total_amount' },
          gst: { $sum: '$gst_amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'garages', localField: '_id', foreignField: '_id',
          as: 'garage', pipeline: [{ $project: { name: 1, city: 1 } }],
        },
      },
      { $unwind: { path: '$garage', preserveNullAndEmptyArrays: true } },
    ]),
    Invoice.aggregate([
      { $match: { created_at: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$created_at' } },
          revenue: { $sum: '$total_amount' },
          gst: { $sum: '$gst_amount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Invoice.aggregate([
      { $group: { _id: null, total_gst: { $sum: '$gst_amount' }, total_revenue: { $sum: '$total_amount' } } },
    ]),
  ]);

  res.json({
    top_garages: perGarage,
    monthly_trend: monthly,
    all_time_gst: gstTotal[0]?.total_gst || 0,
    all_time_revenue: gstTotal[0]?.total_revenue || 0,
  });
}

// GET /api/admin/analytics/jobs
async function jobAnalytics(req, res) {
  const [byStatus, avgStats] = await Promise.all([
    Job.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Job.aggregate([
      { $match: { duration_minutes: { $exists: true, $gt: 0 } } },
      {
        $group: {
          _id: null,
          avg_duration: { $avg: '$duration_minutes' },
          avg_value: { $avg: '$total_amount' },
        },
      },
    ]),
  ]);

  res.json({
    by_status: byStatus,
    avg_duration_minutes: avgStats[0]?.avg_duration || 0,
    avg_job_value: avgStats[0]?.avg_value || 0,
  });
}

// GET /api/admin/analytics/inventory
async function inventoryAnalytics(req, res) {
  const [mostUsed, lowStock] = await Promise.all([
    Job.aggregate([
      { $unwind: '$parts_used' },
      {
        $group: {
          _id: '$parts_used.name',
          total_qty: { $sum: '$parts_used.quantity' },
          total_value: { $sum: '$parts_used.total_price' },
        },
      },
      { $sort: { total_qty: -1 } },
      { $limit: 20 },
    ]),
    Part.find({ $expr: { $lte: ['$quantity', '$min_quantity'] }, is_active: true })
      .populate('garage_id', 'name city')
      .lean(),
  ]);

  res.json({ most_used_parts: mostUsed, low_stock_alerts: lowStock });
}

// GET /api/admin/logs
async function getLogs(req, res) {
  const { garage_id, page = 1, limit = 50 } = req.query;
  const skip = (page - 1) * limit;

  const filter = {};
  if (garage_id) filter.garage_id = garage_id;

  const [logs, total] = await Promise.all([
    ActivityLog.find(filter)
      .populate('user_id', 'name phone role')
      .populate('garage_id', 'name city')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    ActivityLog.countDocuments(filter),
  ]);

  res.json({ data: logs, total, page: Number(page), limit: Number(limit) });
}

// GET /api/admin/garages/:id/services
async function getGarageServices(req, res) {
  const services = await ServiceCatalog.find({ garage_id: req.params.id }).lean();
  res.json(services);
}

module.exports = {
  getPlatformStats,
  listGarages,
  getGarage,
  getGarageUsers,
  getGarageJobs,
  getGarageCustomers,
  getGarageParts,
  toggleGarageActive,
  updateGaragePlan,
  listUsers,
  toggleUserActive,
  resetUserPassword,
  revenueAnalytics,
  jobAnalytics,
  inventoryAnalytics,
  getLogs,
  getGarageServices,
};
