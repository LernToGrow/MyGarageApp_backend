jest.mock('jsonwebtoken');
jest.mock('../../src/models/User.model', () => ({ findById: jest.fn() }));

const jwt  = require('jsonwebtoken');
const User = require('../../src/models/User.model');
const { verifyToken } = require('../../src/middleware/auth.middleware');

const mockRes = () => {
  const r = {};
  r.status = jest.fn(() => r);
  r.json   = jest.fn(() => r);
  return r;
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'test_secret';
});

describe('verifyToken middleware', () => {
  // ── Missing / malformed headers ─────────────────────────────────────────────
  describe('missing or malformed Authorization header', () => {
    it('returns 401 when Authorization header is absent', async () => {
      const req = { headers: {} };
      const res = mockRes();
      await verifyToken(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'No token provided' });
    });

    it('returns 401 when header does not start with "Bearer "', async () => {
      const req = { headers: { authorization: 'Basic abc123' } };
      const res = mockRes();
      await verifyToken(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'No token provided' });
    });

    it('returns 401 for "bearer" (lowercase) prefix', async () => {
      const req = { headers: { authorization: 'bearer tok' } };
      const res = mockRes();
      await verifyToken(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 401 for header with only "Bearer " and no token', async () => {
      const req = { headers: { authorization: 'Bearer ' } };
      const res = mockRes();
      jwt.verify.mockImplementation(() => { throw new Error('jwt must be provided'); });
      await verifyToken(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  // ── JWT verification failures ────────────────────────────────────────────────
  describe('JWT verification failures', () => {
    it('returns 401 when jwt.verify throws JsonWebTokenError', async () => {
      const req = { headers: { authorization: 'Bearer bad_token' } };
      jwt.verify.mockImplementation(() => { throw new Error('invalid token'); });
      const res = mockRes();
      await verifyToken(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    });

    it('returns 401 when token is expired', async () => {
      const req = { headers: { authorization: 'Bearer expired_token' } };
      const err = new Error('jwt expired');
      err.name = 'TokenExpiredError';
      jwt.verify.mockImplementation(() => { throw err; });
      const res = mockRes();
      await verifyToken(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  // ── DB lookup failures ───────────────────────────────────────────────────────
  describe('database user lookup', () => {
    it('returns 401 when user is not found in DB', async () => {
      const req = { headers: { authorization: 'Bearer valid_token' } };
      jwt.verify.mockReturnValue({ id: 'user1' });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
      const res = mockRes();
      await verifyToken(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found or deactivated' });
    });

    it('returns 401 when user.is_active is false', async () => {
      const req = { headers: { authorization: 'Bearer valid_token' } };
      jwt.verify.mockReturnValue({ id: 'user1' });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: 'user1', is_active: false }) });
      const res = mockRes();
      await verifyToken(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('uses JWT_SECRET from environment', async () => {
      process.env.JWT_SECRET = 'my_custom_secret';
      const req = { headers: { authorization: 'Bearer tok' } };
      jwt.verify.mockReturnValue({ id: 'u1' });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ is_active: true }) });
      const next = jest.fn();
      await verifyToken(req, mockRes(), next);
      expect(jwt.verify).toHaveBeenCalledWith('tok', 'my_custom_secret');
    });
  });

  // ── Success path ─────────────────────────────────────────────────────────────
  describe('successful authentication', () => {
    it('attaches user to req and calls next()', async () => {
      const activeUser = { _id: 'user1', is_active: true, role: 'mechanic', garage_id: 'g1' };
      const req = { headers: { authorization: 'Bearer valid_token' } };
      jwt.verify.mockReturnValue({ id: 'user1' });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(activeUser) });
      const next = jest.fn();
      const res = mockRes();
      await verifyToken(req, res, next);
      expect(req.user).toEqual(activeUser);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('calls User.findById with the id from decoded token', async () => {
      const req = { headers: { authorization: 'Bearer tok' } };
      jwt.verify.mockReturnValue({ id: 'decoded_user_id' });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ is_active: true }) });
      await verifyToken(req, mockRes(), jest.fn());
      expect(User.findById).toHaveBeenCalledWith('decoded_user_id');
    });
  });
});
