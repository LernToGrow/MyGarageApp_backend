const express = require('express');
const multer  = require('multer');
const rateLimit = require('express-rate-limit');
const {
  register, login, forgotPassword, resetPassword, setInvitePassword,
  getMe, updateMe, updateProfile, updateGarage, removeGalleryPhoto,
} = require('../controllers/auth.controller');
const { verifyToken } = require('../middleware/auth.middleware');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = express.Router();

// 10 login attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

// Public routes
router.post('/register',        register);
router.post('/login',           loginLimiter, login);
router.post('/forgot-password',      forgotPassword);
router.post('/reset-password',       resetPassword);
router.post('/set-invite-password',  setInvitePassword);

// Protected routes
router.get('/me',           verifyToken, getMe);
router.patch('/me',         verifyToken, updateMe);
router.patch('/profile',    verifyToken, upload.single('photo'), updateProfile);
router.patch('/garage',     verifyToken, upload.fields([{ name: 'garage_photo', maxCount: 1 }, { name: 'gallery', maxCount: 10 }]), updateGarage);
router.delete('/garage/gallery', verifyToken, removeGalleryPhoto);

module.exports = router;
