jest.mock('../../src/models/Customer.model', () => ({
  find:             jest.fn(),
  findOne:          jest.fn(),
  findOneAndUpdate: jest.fn(),
  create:           jest.fn(),
}));
jest.mock('../../src/models/Bike.model', () => ({
  find:   jest.fn(),
  create: jest.fn(),
}));
jest.mock('../../src/models/Job.model', () => ({
  find: jest.fn(),
}));

const Customer = require('../../src/models/Customer.model');
const Bike     = require('../../src/models/Bike.model');
const Job      = require('../../src/models/Job.model');
const {
  listCustomers, createCustomer, getCustomer,
  updateCustomer, addBike, listBikes,
} = require('../../src/controllers/customer.controller');

const mockReq = (overrides = {}) => ({
  user:   { garage_id: 'g1', _id: 'u1' },
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

// ── listCustomers ─────────────────────────────────────────────────────────────
describe('listCustomers', () => {
  const makeChain = (result) => ({
    populate: jest.fn().mockReturnThis(),
    sort:     jest.fn().mockReturnThis(),
    limit:    jest.fn().mockResolvedValue(result),
  });

  it('returns customers when no search param', async () => {
    const customers = [{ name: 'Alice' }, { name: 'Bob' }];
    Customer.find.mockReturnValue(makeChain(customers));
    const res = mockRes();
    await listCustomers(mockReq({ query: {} }), res);
    expect(res.json).toHaveBeenCalledWith({ customers });
  });

  it('queries only by garage_id when no search param', async () => {
    Customer.find.mockReturnValue(makeChain([]));
    await listCustomers(mockReq({ query: {} }), mockRes());
    expect(Customer.find).toHaveBeenCalledWith({ garage_id: 'g1' });
  });

  it('searches by name, phone, and bike plate when search is given', async () => {
    Bike.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ customer_id: 'cid1' }]) });
    Customer.find.mockReturnValue(makeChain([]));
    await listCustomers(mockReq({ query: { search: 'mh01' } }), mockRes());
    expect(Bike.find).toHaveBeenCalledWith({
      garage_id:    'g1',
      plate_number: { $regex: 'mh01', $options: 'i' },
    });
    const query = Customer.find.mock.calls[0][0];
    expect(query.$or).toBeDefined();
    expect(query.$or).toHaveLength(3);
  });

  it('includes bike customer_ids in the $or query when bikes are found', async () => {
    Bike.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ customer_id: 'c99' }]) });
    Customer.find.mockReturnValue(makeChain([]));
    await listCustomers(mockReq({ query: { search: 'xyz' } }), mockRes());
    const orQuery = Customer.find.mock.calls[0][0].$or;
    const idFilter = orQuery.find((c) => c._id);
    expect(idFilter._id.$in).toContain('c99');
  });

  it('returns 500 on DB error', async () => {
    Customer.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort:     jest.fn().mockReturnThis(),
      limit:    jest.fn().mockRejectedValue(new Error('DB error')),
    });
    const res = mockRes();
    await listCustomers(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SERVER_ERROR' }));
  });
});

// ── createCustomer ────────────────────────────────────────────────────────────
describe('createCustomer', () => {
  it('returns 400 when name is missing', async () => {
    const res = mockRes();
    await createCustomer(mockReq({ body: { phone: '9999' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'NAME_PHONE_REQUIRED' }));
  });

  it('returns 400 when phone is missing', async () => {
    const res = mockRes();
    await createCustomer(mockReq({ body: { name: 'Alice' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'NAME_PHONE_REQUIRED' }));
  });

  it('returns 400 when both name and phone are missing', async () => {
    const res = mockRes();
    await createCustomer(mockReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 409 when phone already exists', async () => {
    Customer.findOne.mockResolvedValue({ _id: 'existing' });
    const res = mockRes();
    await createCustomer(mockReq({ body: { name: 'Alice', phone: '9999' } }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CUSTOMER_PHONE_DUPLICATE' }));
  });

  it('includes the existing customer in the 409 response', async () => {
    const existing = { _id: 'c1', name: 'Alice' };
    Customer.findOne.mockResolvedValue(existing);
    const res = mockRes();
    await createCustomer(mockReq({ body: { name: 'Alice', phone: '9999' } }), res);
    expect(res.json.mock.calls[0][0].customer).toEqual(existing);
  });

  it('creates customer and returns 201 on success', async () => {
    Customer.findOne.mockResolvedValue(null);
    const newCustomer = { _id: 'c1', name: 'Alice', phone: '9999' };
    Customer.create.mockResolvedValue(newCustomer);
    const res = mockRes();
    await createCustomer(mockReq({ body: { name: 'Alice', phone: '9999' } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ customer: newCustomer });
  });

  it('defaults language to "en" when not provided', async () => {
    Customer.findOne.mockResolvedValue(null);
    Customer.create.mockResolvedValue({});
    await createCustomer(mockReq({ body: { name: 'Alice', phone: '9999' } }), mockRes());
    expect(Customer.create).toHaveBeenCalledWith(expect.objectContaining({ language: 'en' }));
  });

  it('uses provided language when given', async () => {
    Customer.findOne.mockResolvedValue(null);
    Customer.create.mockResolvedValue({});
    await createCustomer(mockReq({ body: { name: 'Alice', phone: '9999', language: 'mr' } }), mockRes());
    expect(Customer.create).toHaveBeenCalledWith(expect.objectContaining({ language: 'mr' }));
  });

  it('attaches garage_id and created_by from req.user', async () => {
    Customer.findOne.mockResolvedValue(null);
    Customer.create.mockResolvedValue({});
    await createCustomer(mockReq({ body: { name: 'Alice', phone: '9999' } }), mockRes());
    expect(Customer.create).toHaveBeenCalledWith(expect.objectContaining({ garage_id: 'g1', created_by: 'u1' }));
  });

  it('returns 500 on unexpected DB error', async () => {
    Customer.findOne.mockRejectedValue(new Error('db crash'));
    const res = mockRes();
    await createCustomer(mockReq({ body: { name: 'Alice', phone: '9999' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getCustomer ───────────────────────────────────────────────────────────────
describe('getCustomer', () => {
  it('returns 404 when customer not found', async () => {
    Customer.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
    const res = mockRes();
    await getCustomer(mockReq({ params: { id: 'c1' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CUSTOMER_NOT_FOUND' }));
  });

  it('returns customer and their jobs on success', async () => {
    const customer = { _id: 'c1', name: 'Alice' };
    Customer.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(customer) });
    const jobs = [{ job_number: 'JC-0001' }, { job_number: 'JC-0002' }];
    Job.find.mockReturnValue({
      select:   jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      sort:     jest.fn().mockReturnThis(),
      limit:    jest.fn().mockResolvedValue(jobs),
    });
    const res = mockRes();
    await getCustomer(mockReq({ params: { id: 'c1' } }), res);
    expect(res.json).toHaveBeenCalledWith({ customer, jobs });
  });

  it('queries Customer with garage_id and customer id', async () => {
    Customer.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
    await getCustomer(mockReq({ params: { id: 'c99' } }), mockRes());
    expect(Customer.findOne).toHaveBeenCalledWith({ _id: 'c99', garage_id: 'g1' });
  });

  it('returns 500 on DB error', async () => {
    Customer.findOne.mockReturnValue({ populate: jest.fn().mockRejectedValue(new Error('db')) });
    const res = mockRes();
    await getCustomer(mockReq({ params: { id: 'c1' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── updateCustomer ────────────────────────────────────────────────────────────
describe('updateCustomer', () => {
  it('returns 400 for invalid language "fr"', async () => {
    const res = mockRes();
    await updateCustomer(mockReq({ params: { id: 'c1' }, body: { language: 'fr' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'LANGUAGE_INVALID' }));
  });

  it('accepts valid languages: en, mr, hi', async () => {
    for (const lang of ['en', 'mr', 'hi']) {
      Customer.findOneAndUpdate.mockResolvedValue({ _id: 'c1', language: lang });
      const res = mockRes();
      await updateCustomer(mockReq({ params: { id: 'c1' }, body: { language: lang } }), res);
      expect(res.status).not.toHaveBeenCalledWith(400);
    }
  });

  it('returns 404 when customer not found', async () => {
    Customer.findOneAndUpdate.mockResolvedValue(null);
    const res = mockRes();
    await updateCustomer(mockReq({ params: { id: 'c1' }, body: { name: 'New' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CUSTOMER_NOT_FOUND' }));
  });

  it('returns updated customer on success', async () => {
    const updated = { _id: 'c1', name: 'Updated Name' };
    Customer.findOneAndUpdate.mockResolvedValue(updated);
    const res = mockRes();
    await updateCustomer(mockReq({ params: { id: 'c1' }, body: { name: 'Updated Name' } }), res);
    expect(res.json).toHaveBeenCalledWith({ customer: updated });
  });

  it('allows update without a language field', async () => {
    const updated = { _id: 'c1', name: 'New' };
    Customer.findOneAndUpdate.mockResolvedValue(updated);
    const res = mockRes();
    await updateCustomer(mockReq({ params: { id: 'c1' }, body: { name: 'New' } }), res);
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ customer: updated });
  });

  it('returns 500 on DB error', async () => {
    Customer.findOneAndUpdate.mockRejectedValue(new Error('db'));
    const res = mockRes();
    await updateCustomer(mockReq({ params: { id: 'c1' }, body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── addBike ───────────────────────────────────────────────────────────────────
describe('addBike', () => {
  it('returns 400 when make is missing', async () => {
    const res = mockRes();
    await addBike(mockReq({ params: { id: 'c1' }, body: { model: 'CB', plate_number: 'MH01' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'BIKE_FIELDS_REQUIRED' }));
  });

  it('returns 400 when model is missing', async () => {
    const res = mockRes();
    await addBike(mockReq({ params: { id: 'c1' }, body: { make: 'Honda', plate_number: 'MH01' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when plate_number is missing', async () => {
    const res = mockRes();
    await addBike(mockReq({ params: { id: 'c1' }, body: { make: 'Honda', model: 'CB' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when customer not found', async () => {
    Customer.findOne.mockResolvedValue(null);
    const res = mockRes();
    await addBike(mockReq({ params: { id: 'c1' }, body: { make: 'Honda', model: 'CB', plate_number: 'MH01' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CUSTOMER_NOT_FOUND' }));
  });

  it('uppercases plate_number before saving', async () => {
    const customer = { _id: 'c1', bikes: [], save: jest.fn().mockResolvedValue(true) };
    Customer.findOne.mockResolvedValue(customer);
    Bike.create.mockResolvedValue({ _id: 'b1', plate_number: 'MH01AB1234' });
    await addBike(mockReq({ params: { id: 'c1' }, body: { make: 'Honda', model: 'CB', plate_number: 'mh01ab1234' } }), mockRes());
    expect(Bike.create).toHaveBeenCalledWith(expect.objectContaining({ plate_number: 'MH01AB1234' }));
  });

  it('defaults fuel_type to "petrol" when not provided', async () => {
    const customer = { _id: 'c1', bikes: [], save: jest.fn().mockResolvedValue(true) };
    Customer.findOne.mockResolvedValue(customer);
    Bike.create.mockResolvedValue({ _id: 'b1' });
    await addBike(mockReq({ params: { id: 'c1' }, body: { make: 'Honda', model: 'CB', plate_number: 'MH01' } }), mockRes());
    expect(Bike.create).toHaveBeenCalledWith(expect.objectContaining({ fuel_type: 'petrol' }));
  });

  it('pushes bike id to customer.bikes and saves', async () => {
    const customer = { _id: 'c1', bikes: [], save: jest.fn().mockResolvedValue(true) };
    Customer.findOne.mockResolvedValue(customer);
    const bike = { _id: 'b1' };
    Bike.create.mockResolvedValue(bike);
    await addBike(mockReq({ params: { id: 'c1' }, body: { make: 'Honda', model: 'CB', plate_number: 'MH01' } }), mockRes());
    expect(customer.bikes).toContain('b1');
    expect(customer.save).toHaveBeenCalled();
  });

  it('returns 201 with bike on success', async () => {
    const customer = { _id: 'c1', bikes: [], save: jest.fn().mockResolvedValue(true) };
    Customer.findOne.mockResolvedValue(customer);
    const bike = { _id: 'b1', make: 'Honda' };
    Bike.create.mockResolvedValue(bike);
    const res = mockRes();
    await addBike(mockReq({ params: { id: 'c1' }, body: { make: 'Honda', model: 'CB', plate_number: 'MH01' } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ bike });
  });
});

// ── listBikes ─────────────────────────────────────────────────────────────────
describe('listBikes', () => {
  it('returns 404 when customer not found', async () => {
    Customer.findOne.mockResolvedValue(null);
    const res = mockRes();
    await listBikes(mockReq({ params: { id: 'c1' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CUSTOMER_NOT_FOUND' }));
  });

  it('returns bikes for a valid customer', async () => {
    Customer.findOne.mockResolvedValue({ _id: 'c1' });
    const bikes = [{ make: 'Honda' }, { make: 'Bajaj' }];
    Bike.find.mockResolvedValue(bikes);
    const res = mockRes();
    await listBikes(mockReq({ params: { id: 'c1' } }), res);
    expect(res.json).toHaveBeenCalledWith({ bikes });
  });

  it('queries Bike.find with customer_id and garage_id', async () => {
    Customer.findOne.mockResolvedValue({ _id: 'c1' });
    Bike.find.mockResolvedValue([]);
    await listBikes(mockReq({ params: { id: 'c1' } }), mockRes());
    expect(Bike.find).toHaveBeenCalledWith({ customer_id: 'c1', garage_id: 'g1' });
  });

  it('returns empty array when customer has no bikes', async () => {
    Customer.findOne.mockResolvedValue({ _id: 'c1' });
    Bike.find.mockResolvedValue([]);
    const res = mockRes();
    await listBikes(mockReq({ params: { id: 'c1' } }), res);
    expect(res.json).toHaveBeenCalledWith({ bikes: [] });
  });

  it('returns 500 on DB error', async () => {
    Customer.findOne.mockResolvedValue({ _id: 'c1' });
    Bike.find.mockRejectedValue(new Error('db'));
    const res = mockRes();
    await listBikes(mockReq({ params: { id: 'c1' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
