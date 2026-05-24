const { requirePermission } = require('../../src/middleware/permission.middleware');

const mockRes = () => {
  const r = {};
  r.status = jest.fn(() => r);
  r.json   = jest.fn(() => r);
  return r;
};

describe('requirePermission middleware', () => {
  // ── No user ──────────────────────────────────────────────────────────────────
  describe('when req.user is not set', () => {
    it('returns 401 Unauthorized', () => {
      const mw = requirePermission('manage_jobs');
      const res = mockRes();
      mw({}, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('does not call next()', () => {
      const next = jest.fn();
      requirePermission('manage_jobs')({}, mockRes(), next);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ── garage_owner bypass ──────────────────────────────────────────────────────
  describe('garage_owner role', () => {
    it('calls next() regardless of permissions array', () => {
      const next = jest.fn();
      const req  = { user: { role: 'garage_owner', permissions: [] } };
      requirePermission('manage_jobs')(req, mockRes(), next);
      expect(next).toHaveBeenCalled();
    });

    it('calls next() even when permission list does not include the required permission', () => {
      const next = jest.fn();
      const req  = { user: { role: 'garage_owner', permissions: ['some_other'] } };
      requirePermission('admin_only_action')(req, mockRes(), next);
      expect(next).toHaveBeenCalled();
    });

    it('does not touch the response for garage_owner', () => {
      const res = mockRes();
      requirePermission('any_permission')({ user: { role: 'garage_owner', permissions: [] } }, res, jest.fn());
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  // ── Employee / mechanic with permission ──────────────────────────────────────
  describe('user has the required permission', () => {
    it('calls next() when the exact permission is in the list', () => {
      const next = jest.fn();
      const req  = { user: { role: 'employee', permissions: ['manage_jobs', 'view_reports'] } };
      requirePermission('manage_jobs')(req, mockRes(), next);
      expect(next).toHaveBeenCalled();
    });

    it('does not respond with an error when permission is granted', () => {
      const res = mockRes();
      const req = { user: { role: 'mechanic', permissions: ['view_reports'] } };
      requirePermission('view_reports')(req, res, jest.fn());
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  // ── Employee / mechanic without permission ───────────────────────────────────
  describe('user lacks the required permission', () => {
    it('returns 403 with descriptive message', () => {
      const res = mockRes();
      const req = { user: { role: 'employee', permissions: ['manage_jobs'] } };
      requirePermission('manage_inventory')(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Permission denied. Requires: manage_inventory',
      });
    });

    it('does not call next() when permission is denied', () => {
      const next = jest.fn();
      const req  = { user: { role: 'employee', permissions: [] } };
      requirePermission('manage_jobs')(req, mockRes(), next);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 when permissions array is empty', () => {
      const res = mockRes();
      const req = { user: { role: 'mechanic', permissions: [] } };
      requirePermission('manage_jobs')(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('includes the required permission name in the error message', () => {
      const res = mockRes();
      const req = { user: { role: 'employee', permissions: [] } };
      requirePermission('view_billing')(req, res, jest.fn());
      const body = res.json.mock.calls[0][0];
      expect(body.error).toContain('view_billing');
    });
  });

  // ── Isolation between middleware instances ───────────────────────────────────
  describe('middleware isolation', () => {
    it('two instances check their own permissions independently', () => {
      const jobMw  = requirePermission('manage_jobs');
      const partMw = requirePermission('manage_inventory');
      const userWithJobs = { user: { role: 'employee', permissions: ['manage_jobs'] } };

      const next1 = jest.fn();
      jobMw(userWithJobs, mockRes(), next1);
      expect(next1).toHaveBeenCalled();

      const res2 = mockRes();
      const next2 = jest.fn();
      partMw(userWithJobs, res2, next2);
      expect(res2.status).toHaveBeenCalledWith(403);
      expect(next2).not.toHaveBeenCalled();
    });
  });
});
