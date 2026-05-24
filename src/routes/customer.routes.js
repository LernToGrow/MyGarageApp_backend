const express = require('express');
const {
  listCustomers,
  createCustomer,
  getCustomer,
  updateCustomer,
  addBike,
  listBikes,
} = require('../controllers/customer.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { requirePermission } = require('../middleware/permission.middleware');

const router = express.Router();

router.use(verifyToken);

router.get('/',              listCustomers);
router.post('/',             requirePermission('manage_customers'), createCustomer);
router.get('/:id',           getCustomer);
router.patch('/:id',         requirePermission('manage_customers'), updateCustomer);
router.post('/:id/bikes',    requirePermission('manage_customers'), addBike);
router.get('/:id/bikes',     listBikes);

module.exports = router;
