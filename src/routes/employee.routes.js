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
// Allow self-performance lookup without view_reports permission
router.get('/:id/performance', (req, res, next) => {
  if (req.user._id.toString() === req.params.id) return next();
  return requirePermission('view_reports')(req, res, next);
}, getPerformance);

module.exports = router;
