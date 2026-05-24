function requirePermission(permission) {
  return (req, res, next) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    // garage_owner always has full access
    if (user.role === 'garage_owner') return next();

    if (!user.permissions.includes(permission)) {
      return res.status(403).json({
        error: `Permission denied. Requires: ${permission}`,
      });
    }
    next();
  };
}

module.exports = { requirePermission };
