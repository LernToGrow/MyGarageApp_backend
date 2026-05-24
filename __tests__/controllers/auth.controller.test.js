jest.mock('jsonwebtoken');
jest.mock('../../src/config/firebase', () => ({ auth: jest.fn() }));
jest.mock('../../src/models/User.model', () => ({
  findOne:          jest.fn(),
  findById:         jest.fn(),
  findByIdAndUpdate: jest.fn(),
  create:           jest.fn(),
}));
jest.mock('../../src/models/Garage.model', () => ({
  create:           jest.fn(),
  findById:         jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock('../../src/services/cloudinary.service', () => ({
  uploadPhoto: jest.fn(),
}));
jest.mock('mongoose', () => ({
  Types: { ObjectId: jest.fn(() => 'mock_oid') },
}));

const jwt    = require('jsonwebtoken');
const admin  = require('../../src/config/firebase');
const User   = require('../../src/models/User.model');
const Garage = require('../../src/models/Garage.model');
const { uploadPhoto } = require('../../src/services/cloudinary.service');

const {
  sendOtp, verifyOtp, getMe, updateMe, updateProfile, updateGarage, removeGalleryPhoto,
} = require('../../src/controllers/auth.controller');

const mockReq = (overrides = {}) => ({
  user:   { _id: 'u1', garage_id: 'g1' },
  body:   {},
  params: {},
  file:   undefined,
  files:  {},
  ...overrides,
});

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

// ────────────────────────────────────────────────
describe('sendOtp', () => {
  it('returns 400 when phone is missing', async () => {
    const res = mockRes();
    await sendOtp(mockReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PHONE_REQUIRED' }));
  });

  it('returns success message with phone when phone is provided', async () => {
    const res = mockRes();
    await sendOtp(mockReq({ body: { phone: '+911234567890' } }), res);
    expect(res.json).toHaveBeenCalledWith({ message: 'OTP sent via Firebase', phone: '+911234567890' });
  });
});

// ────────────────────────────────────────────────
describe('verifyOtp', () => {
  it('returns 400 when idToken is missing', async () => {
    const res = mockRes();
    await verifyOtp(mockReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_REQUIRED' }));
  });

  it('returns 401 when Firebase token verification fails', async () => {
    admin.auth = jest.fn(() => ({ verifyIdToken: jest.fn().mockRejectedValue(new Error('bad token')) }));

    const res = mockRes();
    await verifyOtp(mockReq({ body: { idToken: 'bad' } }), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_INVALID' }));
  });

  it('returns 400 when decoded token has no phone number', async () => {
    admin.auth = jest.fn(() => ({ verifyIdToken: jest.fn().mockResolvedValue({ phone_number: null }) }));

    const res = mockRes();
    await verifyOtp(mockReq({ body: { idToken: 'tok' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_NO_PHONE' }));
  });

  it('returns 400 for new user without name and garageName', async () => {
    admin.auth = jest.fn(() => ({
      verifyIdToken: jest.fn().mockResolvedValue({ phone_number: '+91999' }),
    }));
    User.findOne.mockResolvedValue(null);

    const res = mockRes();
    await verifyOtp(mockReq({ body: { idToken: 'tok' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'REGISTRATION_INCOMPLETE' }));
  });

  it('creates garage and user for new registration', async () => {
    admin.auth = jest.fn(() => ({
      verifyIdToken: jest.fn().mockResolvedValue({ phone_number: '+91999' }),
    }));
    User.findOne.mockResolvedValue(null);

    const garage = { _id: 'g1', save: jest.fn().mockResolvedValue(true) };
    Garage.create.mockResolvedValue(garage);

    const user = { _id: 'u1', phone: '+91999', name: 'Alice', role: 'garage_owner', garage_id: 'g1', permissions: [] };
    User.create.mockResolvedValue(user);
    jwt.sign.mockReturnValue('jwt_token');

    const res = mockRes();
    await verifyOtp(mockReq({ body: { idToken: 'tok', name: 'Alice', garageName: 'Best Garage' } }), res);

    expect(Garage.create).toHaveBeenCalled();
    expect(User.create).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ token: 'jwt_token' }));
  });

  it('signs in existing user and returns token', async () => {
    admin.auth = jest.fn(() => ({
      verifyIdToken: jest.fn().mockResolvedValue({ phone_number: '+91999' }),
    }));
    const user = { _id: 'u1', phone: '+91999', name: 'Bob', role: 'mechanic', garage_id: 'g1', permissions: ['manage_jobs'] };
    User.findOne.mockResolvedValue(user);
    jwt.sign.mockReturnValue('jwt_token');

    const res = mockRes();
    await verifyOtp(mockReq({ body: { idToken: 'tok' } }), res);

    expect(Garage.create).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ token: 'jwt_token' }));
  });
});

// ────────────────────────────────────────────────
describe('getMe', () => {
  it('returns the populated user', async () => {
    const user = { _id: 'u1', name: 'Alice', garage_id: { name: 'Best Garage' } };
    User.findById.mockReturnValue({
      select:   jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue(user),
    });

    const res = mockRes();
    await getMe(mockReq(), res);

    expect(res.json).toHaveBeenCalledWith({ user });
  });
});

// ────────────────────────────────────────────────
describe('updateMe', () => {
  it('returns 400 for invalid language', async () => {
    const res = mockRes();
    await updateMe(mockReq({ body: { language: 'fr' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'LANGUAGE_INVALID' }));
  });

  it('updates and returns user for valid language', async () => {
    const user = { _id: 'u1', language: 'hi' };
    User.findByIdAndUpdate.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

    const res = mockRes();
    await updateMe(mockReq({ body: { language: 'hi' } }), res);

    expect(res.json).toHaveBeenCalledWith({ user });
  });
});

// ────────────────────────────────────────────────
describe('updateProfile', () => {
  it('returns 400 when nothing to update', async () => {
    const res = mockRes();
    await updateProfile(mockReq({ body: {}, file: undefined }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'NOTHING_TO_UPDATE' }));
  });

  it('updates name when provided', async () => {
    const user = { _id: 'u1', name: 'New Name' };
    User.findByIdAndUpdate.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

    const res = mockRes();
    await updateProfile(mockReq({ body: { name: 'New Name' } }), res);

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'u1', expect.objectContaining({ name: 'New Name' }), expect.anything()
    );
    expect(res.json).toHaveBeenCalledWith({ user });
  });

  it('uploads photo and updates photo_url when file is provided', async () => {
    uploadPhoto.mockResolvedValue('https://cdn.example.com/photo.jpg');
    const user = { _id: 'u1', photo_url: 'https://cdn.example.com/photo.jpg' };
    User.findByIdAndUpdate.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

    const req = mockReq({ body: {}, file: { buffer: Buffer.from('img') } });
    const res = mockRes();
    await updateProfile(req, res);

    expect(uploadPhoto).toHaveBeenCalledWith(req.file.buffer, 'garage/profiles');
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'u1', expect.objectContaining({ photo_url: 'https://cdn.example.com/photo.jpg' }), expect.anything()
    );
  });
});

// ────────────────────────────────────────────────
describe('removeGalleryPhoto', () => {
  it('returns 400 when url is missing', async () => {
    const res = mockRes();
    await removeGalleryPhoto(mockReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'URL_REQUIRED' }));
  });

  it('removes photo from gallery and returns updated garage', async () => {
    const garage = { _id: 'g1', gallery: [] };
    Garage.findByIdAndUpdate.mockReturnValue({ select: jest.fn().mockResolvedValue(garage) });

    const res = mockRes();
    await removeGalleryPhoto(mockReq({ body: { url: 'https://cdn.example.com/old.jpg' } }), res);

    expect(Garage.findByIdAndUpdate).toHaveBeenCalledWith(
      'g1',
      { $pull: { gallery: 'https://cdn.example.com/old.jpg' } },
      { new: true }
    );
    expect(res.json).toHaveBeenCalledWith({ garage });
  });
});
