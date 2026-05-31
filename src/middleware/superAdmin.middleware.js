const { verifyToken } = require('./auth.middleware');

async function requireSuperAdmin(req, res, next) {
  await verifyToken(req, res, () => {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    next();
  });
}

module.exports = { requireSuperAdmin };
