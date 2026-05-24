const express = require('express');
const { listParts, getLowStock, createPart, updatePart, adjustStock } = require('../controllers/part.controller');
const { verifyToken }       = require('../middleware/auth.middleware');
const { requirePermission } = require('../middleware/permission.middleware');

const router = express.Router();

router.use(verifyToken);

// low-stock must be before /:id to avoid being matched as an id
router.get('/low-stock',      getLowStock);
router.get('/',               listParts);
router.post('/',              requirePermission('add_inventory'),  createPart);
router.patch('/:id',          requirePermission('edit_inventory'), updatePart);
router.patch('/:id/stock',    requirePermission('edit_inventory'), adjustStock);

module.exports = router;
