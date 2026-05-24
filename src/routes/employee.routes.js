const express = require('express');
const {
  listEmployees,
  inviteEmployee,
  updatePermissions,
  deactivateEmployee,
  getPerformance,
} = require('../controllers/employee.controller');
const { verifyToken }       = require('../middleware/auth.middleware');
const { requirePermission } = require('../middleware/permission.middleware');

const router = express.Router();

router.use(verifyToken);

// Only garage_owner can manage employees — permission middleware handles this.
// requirePermission for owner always passes; employees need the named permission.
router.get('/',                      listEmployees);
router.post('/invite',               requirePermission('add_employee'),  inviteEmployee);
router.patch('/:id/permissions',     requirePermission('edit_employee'), updatePermissions);
router.patch('/:id/deactivate',      requirePermission('edit_employee'), deactivateEmployee);
router.get('/:id/performance',       requirePermission('view_reports'),  getPerformance);

module.exports = router;
