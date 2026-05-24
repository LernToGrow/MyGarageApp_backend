jest.mock('../../src/models/Part.model', () => ({
  find:            jest.fn(),
  findOne:         jest.fn(),
  findOneAndUpdate: jest.fn(),
  create:          jest.fn(),
}));

const Part = require('../../src/models/Part.model');
const {
  listParts, getLowStock, createPart, updatePart, adjustStock,
} = require('../../src/controllers/part.controller');

const mockReq = (overrides = {}) => ({
  user:   { garage_id: 'g1' },
  body:   {},
  query:  {},
  params: {},
  ...overrides,
});

const mockRes = () => {
  const r = {};
  r.status = jest.fn(() => r);
  r.json   = jest.fn(() => r);
  return r;
};

beforeEach(() => jest.clearAllMocks());

// ────────────────────────────────────────────────
describe('listParts', () => {
  it('returns all active parts for the garage', async () => {
    const parts = [{ name_en: 'Brake Pad' }];
    Part.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(parts) });

    const res = mockRes();
    await listParts(mockReq(), res);

    expect(res.json).toHaveBeenCalledWith({ parts });
  });

  it('applies category filter when provided', async () => {
    Part.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) });

    await listParts(mockReq({ query: { category: 'brakes' } }), mockRes());

    expect(Part.find).toHaveBeenCalledWith(
      expect.objectContaining({ category: { $regex: 'brakes', $options: 'i' } })
    );
  });

  it('applies low-stock $expr filter when stock=low', async () => {
    Part.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) });

    await listParts(mockReq({ query: { stock: 'low' } }), mockRes());

    expect(Part.find).toHaveBeenCalledWith(
      expect.objectContaining({ $expr: { $lt: ['$quantity', '$min_quantity'] } })
    );
  });

  it('returns 500 on DB error', async () => {
    Part.find.mockReturnValue({ sort: jest.fn().mockRejectedValue(new Error('DB error')) });

    const res = mockRes();
    await listParts(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ────────────────────────────────────────────────
describe('getLowStock', () => {
  it('returns low-stock parts and count', async () => {
    const parts = [{ name_en: 'Filter', quantity: 1, min_quantity: 5 }];
    Part.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(parts) });

    const res = mockRes();
    await getLowStock(mockReq(), res);

    expect(res.json).toHaveBeenCalledWith({ parts, count: 1 });
  });
});

// ────────────────────────────────────────────────
describe('createPart', () => {
  it('returns 400 when name_en or sell_price is missing', async () => {
    const res = mockRes();
    await createPart(mockReq({ body: { name_en: 'Pad' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PART_FIELDS_REQUIRED' }));
  });

  it('creates and returns part on success', async () => {
    const part = { _id: 'p1', name_en: 'Brake Pad', sell_price: 200 };
    Part.create.mockResolvedValue(part);

    const req = mockReq({ body: { name_en: 'Brake Pad', sell_price: 200 } });
    const res = mockRes();
    await createPart(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ part });
  });

  it('defaults quantity to 0 when not provided', async () => {
    Part.create.mockResolvedValue({});

    await createPart(mockReq({ body: { name_en: 'Pad', sell_price: 100 } }), mockRes());

    expect(Part.create).toHaveBeenCalledWith(expect.objectContaining({ quantity: 0 }));
  });

  it('defaults min_quantity to 2 when not provided', async () => {
    Part.create.mockResolvedValue({});

    await createPart(mockReq({ body: { name_en: 'Pad', sell_price: 100 } }), mockRes());

    expect(Part.create).toHaveBeenCalledWith(expect.objectContaining({ min_quantity: 2 }));
  });
});

// ────────────────────────────────────────────────
describe('updatePart', () => {
  it('returns 404 when part not found', async () => {
    Part.findOneAndUpdate.mockResolvedValue(null);

    const res = mockRes();
    await updatePart(mockReq({ params: { id: 'p1' }, body: { sell_price: 300 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PART_NOT_FOUND' }));
  });

  it('returns updated part on success', async () => {
    const updated = { _id: 'p1', sell_price: 300 };
    Part.findOneAndUpdate.mockResolvedValue(updated);

    const res = mockRes();
    await updatePart(mockReq({ params: { id: 'p1' }, body: { sell_price: 300 } }), res);

    expect(res.json).toHaveBeenCalledWith({ part: updated });
  });
});

// ────────────────────────────────────────────────
describe('adjustStock', () => {
  it('returns 400 when adjustment is missing', async () => {
    const res = mockRes();
    await adjustStock(mockReq({ params: { id: 'p1' }, body: {} }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'ADJUSTMENT_REQUIRED' }));
  });

  it('returns 400 when adjustment is not a number', async () => {
    const res = mockRes();
    await adjustStock(mockReq({ params: { id: 'p1' }, body: { adjustment: 'many' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when part not found', async () => {
    Part.findOne.mockResolvedValue(null);

    const res = mockRes();
    await adjustStock(mockReq({ params: { id: 'p1' }, body: { adjustment: 5 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PART_NOT_FOUND' }));
  });

  it('returns 400 when adjustment would result in negative stock', async () => {
    Part.findOne.mockResolvedValue({ quantity: 2, min_quantity: 5 });

    const res = mockRes();
    await adjustStock(mockReq({ params: { id: 'p1' }, body: { adjustment: -5 } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'NEGATIVE_STOCK' }));
  });

  it('updates stock and returns part on success', async () => {
    const part = { _id: 'p1', quantity: 10, min_quantity: 5, save: jest.fn().mockResolvedValue(true) };
    Part.findOne.mockResolvedValue(part);

    const res = mockRes();
    await adjustStock(mockReq({ params: { id: 'p1' }, body: { adjustment: 5 } }), res);

    expect(part.quantity).toBe(15);
    expect(part.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ part }));
  });

  it('includes low_stock_warning when stock falls below min_quantity', async () => {
    const part = { _id: 'p1', quantity: 3, min_quantity: 5, save: jest.fn().mockResolvedValue(true) };
    Part.findOne.mockResolvedValue(part);

    const res = mockRes();
    await adjustStock(mockReq({ params: { id: 'p1' }, body: { adjustment: -1 } }), res);

    const callArg = res.json.mock.calls[0][0];
    expect(callArg.low_stock_warning).toBeTruthy();
  });

  it('does not include low_stock_warning when stock is above min_quantity', async () => {
    const part = { _id: 'p1', quantity: 10, min_quantity: 5, save: jest.fn().mockResolvedValue(true) };
    Part.findOne.mockResolvedValue(part);

    const res = mockRes();
    await adjustStock(mockReq({ params: { id: 'p1' }, body: { adjustment: 2 } }), res);

    const callArg = res.json.mock.calls[0][0];
    expect(callArg.low_stock_warning).toBeUndefined();
  });
});
