const express = require('express');
const {
  createJob, listJobs, getJob,
  saveInspection,
  setEstimate,
  startJob,
  addServices, markServiceDone, removeService,
  removePart,
  addPart,
  completeJob,
  recordPayment,
  remitPayment,
  getInvoice, getInvoicePdf,
  deleteJob,
} = require('../controllers/job.controller');
const { verifyToken }       = require('../middleware/auth.middleware');
const { requirePermission } = require('../middleware/permission.middleware');

const router = express.Router();

router.use(verifyToken);

// Job CRUD
router.post('/',      requirePermission('add_job'),    createJob);
router.get('/',       listJobs);
router.get('/:id',    getJob);
router.delete('/:id', requirePermission('delete_job'), deleteJob);

// Job flow steps
router.patch('/:id/inspection',           requirePermission('edit_job'), saveInspection);
router.patch('/:id/estimate',             requirePermission('edit_job'), setEstimate);
router.patch('/:id/start',                requirePermission('edit_job'), startJob);
router.post('/:id/services',              requirePermission('edit_job'), addServices);
router.patch('/:id/services/:svcId',      requirePermission('edit_job'), markServiceDone);
router.delete('/:id/services/:svcId',     requirePermission('edit_job'), removeService);
router.post('/:id/parts',                 requirePermission('edit_job'), addPart);
router.delete('/:id/parts/:partIndex',    requirePermission('edit_job'), removePart);
router.patch('/:id/complete',             requirePermission('edit_job'), completeJob);
router.post('/:id/payment',               requirePermission('add_billing'), recordPayment);
router.patch('/:id/remit',                requirePermission('view_billing'), remitPayment);

// Invoice
router.get('/:id/invoice',     requirePermission('view_billing'), getInvoice);
router.get('/:id/invoice/pdf', requirePermission('view_billing'), getInvoicePdf);

module.exports = router;
