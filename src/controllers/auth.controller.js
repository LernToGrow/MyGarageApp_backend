const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const User     = require('../models/User.model');
const Garage   = require('../models/Garage.model');
const mongoose = require('mongoose');
const { uploadPhoto } = require('../services/cloudinary.service');

// POST /api/auth/register
// First-time garage owner registration
async function register(req, res) {
  try {
    const { phone, password, name, garageName } = req.body;

    if (!phone || !password || !name || !garageName) {
      res.status(400).json({
        error: 'phone, password, name and garageName are required',
        code: 'REGISTRATION_INCOMPLETE',
      });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters', code: 'PASSWORD_TOO_SHORT' });
      return;
    }

    const existing = await User.findOne({ phone });
    if (existing) {
      res.status(409).json({ error: 'A user with this phone already exists', code: 'PHONE_DUPLICATE' });
      return;
    }

    const password_hash = await bcrypt.hash(password, 10);

    const garage = await Garage.create({
      name:     garageName,
      phone,
      owner_id: new mongoose.Types.ObjectId(),
    });

    const user = await User.create({
      phone,
      name,
      password_hash,
      role:        'garage_owner',
      garage_id:   garage._id,
      permissions: [],
    });

    garage.owner_id = user._id;
    await garage.save();

    const token = jwt.sign(
      { id: user._id, role: user.role, garage_id: user.garage_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    res.status(201).json({
      token,
      user: _userPayload(user),
    });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// POST /api/auth/login
async function login(req, res) {
  try {
    const { phone: rawPhone, password } = req.body;

    if (!rawPhone || !password) {
      res.status(400).json({ error: 'phone and password are required', code: 'CREDENTIALS_REQUIRED' });
      return;
    }

    // Match phone stored as +91xxx, 91xxx, or plain digits
    const digits = rawPhone.replace(/^\+?91/, '');
    const user = await User.findOne({
      phone: { $in: [digits, `+91${digits}`, `91${digits}`] },
    });
    if (!user || !user.is_active) {
      res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
      return;
    }

    if (!user.password_hash) {
      res.status(401).json({ error: 'Account has no password set. Contact your admin.', code: 'NO_PASSWORD' });
      return;
    }

    const match = await user.comparePassword(password);
    if (!match) {
      res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
      return;
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, garage_id: user.garage_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    res.json({ token, user: _userPayload(user) });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// POST /api/auth/forgot-password
// Generates a reset token. In production send it via SMS/email; here it is returned
// in the response body so the mobile client can pass it to the reset screen directly.
async function forgotPassword(req, res) {
  try {
    const { phone } = req.body;
    if (!phone) {
      res.status(400).json({ error: 'phone is required', code: 'PHONE_REQUIRED' });
      return;
    }

    const user = await User.findOne({ phone, is_active: true });
    // Always respond with 200 to avoid leaking whether phone is registered
    if (!user) {
      res.json({ message: 'If this phone is registered you will receive a reset code.' });
      return;
    }

    const reset_token         = crypto.randomBytes(32).toString('hex');
    const reset_token_expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    user.reset_token         = reset_token;
    user.reset_token_expires = reset_token_expires;
    await user.save();

    // TODO: send reset_token via SMS/email in production
    res.json({
      message: 'Reset code generated. Use it within 1 hour.',
      reset_token, // remove from response once SMS/email is wired up
    });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// POST /api/auth/reset-password
async function resetPassword(req, res) {
  try {
    const { phone, reset_token, new_password } = req.body;

    if (!phone || !reset_token || !new_password) {
      res.status(400).json({ error: 'phone, reset_token and new_password are required', code: 'RESET_FIELDS_REQUIRED' });
      return;
    }

    if (new_password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters', code: 'PASSWORD_TOO_SHORT' });
      return;
    }

    const user = await User.findOne({
      phone,
      reset_token,
      reset_token_expires: { $gt: new Date() },
    });

    if (!user) {
      res.status(400).json({ error: 'Invalid or expired reset token', code: 'RESET_TOKEN_INVALID' });
      return;
    }

    user.password_hash       = await bcrypt.hash(new_password, 10);
    user.reset_token         = undefined;
    user.reset_token_expires = undefined;
    await user.save();

    res.json({ message: 'Password reset successfully. Please log in.' });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// GET /api/auth/me
async function getMe(req, res) {
  try {
    const user = await User.findById(req.user._id)
      .select('-__v -password_hash -reset_token -reset_token_expires')
      .populate('garage_id', 'name phone address city gstin logo_url garage_photo_url gallery language');
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// PATCH /api/auth/me
async function updateMe(req, res) {
  try {
    const { language } = req.body;
    const allowed = ['en', 'mr', 'hi'];
    if (language && !allowed.includes(language)) {
      res.status(400).json({ error: 'Invalid language. Use en, mr, or hi.', code: 'LANGUAGE_INVALID' });
      return;
    }

    const update = {};
    if (language) update.language = language;

    const user = await User.findByIdAndUpdate(req.user._id, update, { returnDocument: 'after' })
      .select('-__v -password_hash -reset_token -reset_token_expires');
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// PATCH /api/auth/profile  (multipart: field "name", file "photo")
async function updateProfile(req, res) {
  try {
    const update = {};
    if (req.body.name && req.body.name.trim()) update.name = req.body.name.trim();
    if (req.file) {
      const url = await uploadPhoto(req.file.buffer, 'garage/profiles');
      if (url) update.photo_url = url;
    }
    if (!Object.keys(update).length) {
      res.status(400).json({ error: 'Nothing to update.', code: 'NOTHING_TO_UPDATE' });
      return;
    }
    const user = await User.findByIdAndUpdate(req.user._id, update, { returnDocument: 'after' })
      .select('-__v -password_hash -reset_token -reset_token_expires');
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// PATCH /api/auth/garage
async function updateGarage(req, res) {
  try {
    const update = {};
    const { address, city, gstin } = req.body;
    if (address !== undefined) update.address = address;
    if (city !== undefined)    update.city    = city;
    if (gstin !== undefined)   update.gstin   = gstin;

    const files = req.files || {};

    if (files.garage_photo && files.garage_photo[0]) {
      const url = await uploadPhoto(files.garage_photo[0].buffer, 'garage/cover');
      if (url) update.garage_photo_url = url;
    }

    if (files.gallery && files.gallery.length) {
      const urls = await Promise.all(
        files.gallery.map((f) => uploadPhoto(f.buffer, 'garage/gallery'))
      );
      const validUrls = urls.filter(Boolean);
      update.$push = { gallery: { $each: validUrls } };
    }

    const { $push, ...setFields } = update;
    const mongoUpdate = Object.keys(setFields).length ? { $set: setFields } : {};
    if ($push) mongoUpdate.$push = $push;

    if (!Object.keys(mongoUpdate).length) {
      res.status(400).json({ error: 'Nothing to update.', code: 'NOTHING_TO_UPDATE' });
      return;
    }

    const garage = await Garage.findByIdAndUpdate(req.user.garage_id, mongoUpdate, { new: true }).select('-__v');
    res.json({ garage });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// DELETE /api/auth/garage/gallery
async function removeGalleryPhoto(req, res) {
  try {
    const { url } = req.body;
    if (!url) { res.status(400).json({ error: 'url is required.', code: 'URL_REQUIRED' }); return; }
    const garage = await Garage.findByIdAndUpdate(
      req.user.garage_id,
      { $pull: { gallery: url } },
      { new: true }
    ).select('-__v');
    res.json({ garage });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

// POST /api/auth/set-invite-password
async function setInvitePassword(req, res) {
  try {
    const { phone, token, new_password } = req.body;

    if (!phone || !token || !new_password) {
      res.status(400).json({ error: 'phone, token and new_password are required', code: 'FIELDS_REQUIRED' });
      return;
    }

    if (new_password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters', code: 'PASSWORD_TOO_SHORT' });
      return;
    }

    const user = await User.findOne({
      phone,
      reset_token: token,
      reset_token_expires: { $gt: new Date() },
      password_hash: { $exists: false },
    });

    if (!user) {
      res.status(400).json({ error: 'Invalid or expired invite link', code: 'INVITE_TOKEN_INVALID' });
      return;
    }

    user.password_hash       = await bcrypt.hash(new_password, 10);
    user.reset_token         = undefined;
    user.reset_token_expires = undefined;
    await user.save();

    res.json({ message: 'Password set. You can now log in.' });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
}

function _userPayload(user) {
  return {
    _id:         user._id,
    name:        user.name,
    phone:       user.phone,
    role:        user.role,
    garage_id:   user.garage_id,
    permissions: user.permissions,
    language:    user.language,
  };
}

module.exports = {
  register, login, forgotPassword, resetPassword, setInvitePassword,
  getMe, updateMe, updateProfile, updateGarage, removeGalleryPhoto,
};
