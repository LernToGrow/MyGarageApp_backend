const express = require('express');
const { getSummary, getMonthly, getAlerts, getPayments } = require('../controllers/dashboard.controller');
const { verifyToken }       = require('../middleware/auth.middleware');
const { requirePermission } = require('../middleware/permission.middleware');

const router = express.Router();

router.use(verifyToken);

router.get('/summary', getSummary);
router.get('/monthly', requirePermission('view_reports'), getMonthly);
router.get('/alerts',   getAlerts);
router.get('/payments', getPayments);

module.exports = router;
