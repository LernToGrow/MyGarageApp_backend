const Job  = require('../models/Job.model');
const Part = require('../models/Part.model');

// GET /api/dashboard/summary
// Today's snapshot: active jobs, done jobs, revenue collected, pending dues
async function getSummary(req, res) {
  try {
    const garage_id = req.user.garage_id;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayQuery = { garage_id, created_at: { $gte: todayStart, $lte: todayEnd } };

    const [
      active_jobs,
      done_jobs,
      revenueAgg,
      duesAgg,
    ] = await Promise.all([
      Job.countDocuments({ garage_id, status: { $in: ['received', 'inspecting', 'estimated', 'in_progress'] } }),
      Job.countDocuments({ ...todayQuery, status: { $in: ['done', 'paid', 'closed'] } }),
      Job.aggregate([
        { $match: { garage_id, paid_at: { $gte: todayStart, $lte: todayEnd } } },
        { $group: { _id: null, total: { $sum: '$amount_paid' } } },
      ]),
      Job.aggregate([
        { $match: { garage_id, payment_status: { $in: ['pending', 'partial'] }, status: { $nin: ['received'] } } },
        { $group: { _id: null, total: { $sum: '$balance_due' } } },
      ]),
    ]);

    res.json({
      active_jobs,
      done_jobs_today:    done_jobs,
      today_revenue:      revenueAgg[0]?.total    || 0,
      total_pending_dues: duesAgg[0]?.total        || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/dashboard/monthly
// Revenue summary for a date range.
// Accepts ?from=YYYY-MM-DD&to=YYYY-MM-DD  OR legacy ?year=&month= (0-indexed)
async function getMonthly(req, res) {
  try {
    const garage_id = req.user.garage_id;
    const { from, to, year, month } = req.query;

    let rangeStart, rangeEnd, targetYear, targetMonth;

    if (from && to) {
      rangeStart   = new Date(from);
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd     = new Date(to);
      rangeEnd.setHours(23, 59, 59, 999);
      targetYear   = rangeStart.getFullYear();
      targetMonth  = rangeStart.getMonth();
    } else {
      const now    = new Date();
      targetYear   = parseInt(year)  || now.getFullYear();
      targetMonth  = parseInt(month) || now.getMonth();
      rangeStart   = new Date(targetYear, targetMonth, 1);
      rangeEnd     = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
    }

    const monthStart = rangeStart;
    const monthEnd   = rangeEnd;

    const [revenueAgg, jobStats, duesAgg] = await Promise.all([
      // Revenue split by payment mode
      Job.aggregate([
        { $match: { garage_id, payment_status: 'paid', paid_at: { $gte: monthStart, $lte: monthEnd } } },
        { $group: {
            _id:             '$payment_mode',
            collected:       { $sum: '$amount_paid' },
            count:           { $sum: 1 },
        }},
      ]),
      // Job timing stats (done + paid + closed jobs)
      Job.aggregate([
        { $match: { garage_id, status: { $in: ['done', 'paid', 'closed'] }, end_time: { $gte: monthStart, $lte: monthEnd } } },
        { $group: {
            _id:                  null,
            total_jobs:           { $sum: 1 },
            total_duration:       { $sum: '$duration_minutes' },
            on_time_count:        { $sum: {
              $cond: [
                { $and: [
                  { $ne: ['$estimated_ready_at', null] },
                  { $lte: ['$end_time', '$estimated_ready_at'] },
                ]},
                1, 0,
              ],
            }},
        }},
      ]),
      // Pending dues accumulated this month
      Job.aggregate([
        { $match: { garage_id, payment_status: { $in: ['pending', 'partial'] } } },
        { $group: { _id: null, total: { $sum: '$balance_due' } } },
      ]),
    ]);

    const cashEntry   = revenueAgg.find((r) => r._id === 'cash')   || { collected: 0, count: 0 };
    const onlineEntry = revenueAgg.find((r) => r._id === 'online') || { collected: 0, count: 0 };
    const stats       = jobStats[0] || { total_jobs: 0, total_duration: 0, on_time_count: 0 };

    const total_revenue = cashEntry.collected + onlineEntry.collected;
    const total_jobs    = stats.total_jobs;
    const avg_duration  = total_jobs ? Math.round(stats.total_duration / total_jobs) : 0;
    const on_time_rate  = total_jobs ? `${Math.round((stats.on_time_count / total_jobs) * 100)}%` : 'N/A';

    res.json({
      period:                    `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`,
      total_revenue,
      cash_collected:            cashEntry.collected,
      online_collected:          onlineEntry.collected,
      total_jobs,
      pending_dues:              duesAgg[0]?.total || 0,
      jobs_on_time:              stats.on_time_count,
      avg_job_duration_minutes:  avg_duration,
      on_time_rate,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/dashboard/alerts
// Low-stock parts + overdue payments (unpaid for >7 days)
async function getAlerts(req, res) {
  try {
    const garage_id = req.user.garage_id;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [lowStockParts, overdueJobs] = await Promise.all([
      Part.find({
        garage_id,
        is_active: true,
        $expr:     { $lt: ['$quantity', '$min_quantity'] },
      }).select('name_en quantity min_quantity category').sort({ quantity: 1 }),

      Job.find({
        garage_id,
        payment_status: { $in: ['pending', 'partial'] },
        status:         { $in: ['done', 'paid'] },
        updated_at:     { $lte: sevenDaysAgo },
      })
        .select('job_number balance_due customer_id updated_at')
        .populate('customer_id', 'name phone')
        .sort({ balance_due: -1 })
        .limit(20),
    ]);

    res.json({
      low_stock_count:  lowStockParts.length,
      low_stock_parts:  lowStockParts,
      overdue_count:    overdueJobs.length,
      overdue_payments: overdueJobs,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/dashboard/payments?page=1&limit=20&year=&month=
// Paginated list of jobs that have a payment (amount_paid > 0), newest first
async function getPayments(req, res) {
  try {
    const garage_id = req.user.garage_id;
    const page      = Math.max(1, parseInt(req.query.page)  || 1);
    const limit     = Math.min(50, parseInt(req.query.limit) || 20);
    const skip      = (page - 1) * limit;

    const match = { garage_id, amount_paid: { $gt: 0 } };

    if (req.query.from && req.query.to) {
      const from = new Date(req.query.from); from.setHours(0, 0, 0, 0);
      const to   = new Date(req.query.to);   to.setHours(23, 59, 59, 999);
      match.paid_at = { $gte: from, $lte: to };
    } else if (req.query.year && req.query.month !== undefined) {
      const y = parseInt(req.query.year);
      const m = parseInt(req.query.month);
      match.paid_at = {
        $gte: new Date(y, m, 1),
        $lte: new Date(y, m + 1, 0, 23, 59, 59, 999),
      };
    }

    const [payments, total] = await Promise.all([
      Job.find(match)
        .sort({ paid_at: -1, updated_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('customer_id', 'name phone')
        .populate('bike_id', 'make model plate_number')
        .select('job_number customer_id bike_id status amount_paid balance_due payment_mode payment_status paid_at total_amount'),
      Job.countDocuments(match),
    ]);

    res.json({
      payments,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getSummary, getMonthly, getAlerts, getPayments };
