const express = require('express');
const router = express.Router();
const { requireSuperAdmin } = require('../middleware/superAdmin.middleware');
const ctrl = require('../controllers/admin.controller');

router.use(requireSuperAdmin);

router.get('/stats', ctrl.getPlatformStats);

router.get('/garages', ctrl.listGarages);
router.get('/garages/:id', ctrl.getGarage);
router.get('/garages/:id/users', ctrl.getGarageUsers);
router.get('/garages/:id/jobs', ctrl.getGarageJobs);
router.get('/garages/:id/customers', ctrl.getGarageCustomers);
router.get('/garages/:id/parts', ctrl.getGarageParts);
router.get('/garages/:id/services', ctrl.getGarageServices);
router.patch('/garages/:id/activate', ctrl.toggleGarageActive);
router.patch('/garages/:id/plan', ctrl.updateGaragePlan);

router.get('/users', ctrl.listUsers);
router.patch('/users/:id/activate', ctrl.toggleUserActive);
router.post('/users/:id/reset-password', ctrl.resetUserPassword);

router.get('/analytics/revenue', ctrl.revenueAnalytics);
router.get('/analytics/jobs', ctrl.jobAnalytics);
router.get('/analytics/inventory', ctrl.inventoryAnalytics);

router.get('/logs', ctrl.getLogs);

module.exports = router;
