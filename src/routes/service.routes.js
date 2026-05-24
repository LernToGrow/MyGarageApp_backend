const express = require('express');
const { listServices, createService, updateService } = require('../controllers/service.controller');
const { verifyToken }       = require('../middleware/auth.middleware');
const { requirePermission } = require('../middleware/permission.middleware');

const router = express.Router();

router.use(verifyToken);

router.get('/',      listServices);
router.post('/',     requirePermission('manage_services'), createService);
router.patch('/:id', requirePermission('manage_services'), updateService);

module.exports = router;
