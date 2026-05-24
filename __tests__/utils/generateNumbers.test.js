const mongoose = require('mongoose');

// Mock mongoose before requiring the utils
jest.mock('mongoose', () => {
  const findByIdAndUpdate = jest.fn();
  const mockModel = { findByIdAndUpdate };

  return {
    Schema: jest.fn().mockImplementation(() => ({})),
    models: {},
    model: jest.fn(() => mockModel),
    _mockFindByIdAndUpdate: findByIdAndUpdate,
    _mockModel: mockModel,
  };
});

const { _mockFindByIdAndUpdate: findByIdAndUpdate } = require('mongoose');

// Require after mock is in place
const generateJobNumber = require('../../src/utils/generateJobNumber');
const generateInvoiceNumber = require('../../src/utils/generateInvoiceNumber');

beforeEach(() => {
  findByIdAndUpdate.mockClear();
});

describe('generateJobNumber', () => {
  it('returns JC-XXXX formatted string', async () => {
    findByIdAndUpdate.mockResolvedValueOnce({ seq: 1 });
    const result = await generateJobNumber('garage1');
    expect(result).toBe('JC-0001');
  });

  it('pads sequence number to 4 digits', async () => {
    findByIdAndUpdate.mockResolvedValueOnce({ seq: 42 });
    const result = await generateJobNumber('garage1');
    expect(result).toBe('JC-0042');
  });

  it('handles large sequence numbers without truncation', async () => {
    findByIdAndUpdate.mockResolvedValueOnce({ seq: 10000 });
    const result = await generateJobNumber('garage1');
    expect(result).toBe('JC-10000');
  });

  it('uses the correct counter key for the garage', async () => {
    findByIdAndUpdate.mockResolvedValueOnce({ seq: 1 });
    await generateJobNumber('myGarage');
    expect(findByIdAndUpdate).toHaveBeenCalledWith(
      'job_myGarage',
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
  });
});

describe('generateInvoiceNumber', () => {
  it('returns INV-XXXX formatted string', async () => {
    findByIdAndUpdate.mockResolvedValueOnce({ seq: 1 });
    const result = await generateInvoiceNumber('garage1');
    expect(result).toBe('INV-0001');
  });

  it('pads sequence number to 4 digits', async () => {
    findByIdAndUpdate.mockResolvedValueOnce({ seq: 7 });
    const result = await generateInvoiceNumber('garage1');
    expect(result).toBe('INV-0007');
  });

  it('handles large sequence numbers without truncation', async () => {
    findByIdAndUpdate.mockResolvedValueOnce({ seq: 9999 });
    const result = await generateInvoiceNumber('garage1');
    expect(result).toBe('INV-9999');
  });

  it('uses the correct counter key for the garage', async () => {
    findByIdAndUpdate.mockResolvedValueOnce({ seq: 1 });
    await generateInvoiceNumber('myGarage');
    expect(findByIdAndUpdate).toHaveBeenCalledWith(
      'invoice_myGarage',
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
  });
});
