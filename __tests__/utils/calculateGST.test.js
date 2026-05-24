const calculateTotals = require('../../src/utils/calculateGST');

describe('calculateTotals (GST)', () => {
  // ── Services ────────────────────────────────────────────────────────────────
  describe('services only', () => {
    it('sums multiple labour charges and applies 18% GST', () => {
      const { subtotal, gst_amount, total_amount } = calculateTotals(
        [{ labour_charge: 500 }, { labour_charge: 300 }], []
      );
      expect(subtotal).toBe(800);
      expect(gst_amount).toBe(144);
      expect(total_amount).toBe(944);
    });

    it('handles a single service', () => {
      const { subtotal, gst_amount, total_amount } = calculateTotals([{ labour_charge: 1000 }], []);
      expect(subtotal).toBe(1000);
      expect(gst_amount).toBe(180);
      expect(total_amount).toBe(1180);
    });

    it('treats undefined labour_charge as 0', () => {
      const { subtotal } = calculateTotals([{ labour_charge: undefined }, { labour_charge: 200 }], []);
      expect(subtotal).toBe(200);
    });

    it('treats null labour_charge as 0', () => {
      const { subtotal } = calculateTotals([{ labour_charge: null }, { labour_charge: 100 }], []);
      expect(subtotal).toBe(100);
    });

    it('handles services with zero charge', () => {
      const { subtotal, gst_amount, total_amount } = calculateTotals([{ labour_charge: 0 }], []);
      expect(subtotal).toBe(0);
      expect(gst_amount).toBe(0);
      expect(total_amount).toBe(0);
    });
  });

  // ── Parts ───────────────────────────────────────────────────────────────────
  describe('parts only', () => {
    it('sums inventory parts by total_price', () => {
      const parts = [
        { source_type: 'inventory', total_price: 400 },
        { source_type: 'inventory', total_price: 200 },
      ];
      expect(calculateTotals([], parts).subtotal).toBe(600);
    });

    it('excludes customer_supplied parts from subtotal', () => {
      const parts = [
        { source_type: 'customer_supplied', total_price: 9999 },
        { source_type: 'inventory', total_price: 300 },
      ];
      expect(calculateTotals([], parts).subtotal).toBe(300);
    });

    it('treats undefined total_price as 0 for inventory parts', () => {
      const { subtotal } = calculateTotals([], [{ source_type: 'inventory', total_price: undefined }]);
      expect(subtotal).toBe(0);
    });

    it('handles own_stock source_type the same as inventory (includes in total)', () => {
      const parts = [{ source_type: 'own_stock', total_price: 500 }];
      // own_stock is not 'customer_supplied', so it is included
      expect(calculateTotals([], parts).subtotal).toBe(500);
    });

    it('returns 0 for all-customer-supplied parts', () => {
      const parts = [
        { source_type: 'customer_supplied', total_price: 1000 },
        { source_type: 'customer_supplied', total_price: 2000 },
      ];
      const { subtotal, gst_amount, total_amount } = calculateTotals([], parts);
      expect(subtotal).toBe(0);
      expect(gst_amount).toBe(0);
      expect(total_amount).toBe(0);
    });
  });

  // ── Combined ─────────────────────────────────────────────────────────────────
  describe('services + parts combined', () => {
    it('adds service labour and inventory parts, excludes customer-supplied', () => {
      const services = [{ labour_charge: 500 }];
      const parts = [
        { source_type: 'inventory', total_price: 300 },
        { source_type: 'customer_supplied', total_price: 100 },
      ];
      const { subtotal, gst_amount, total_amount } = calculateTotals(services, parts);
      expect(subtotal).toBe(800);
      expect(gst_amount).toBe(144);
      expect(total_amount).toBe(944);
    });

    it('handles large amounts correctly', () => {
      const services = [{ labour_charge: 50000 }];
      const parts    = [{ source_type: 'inventory', total_price: 100000 }];
      const { subtotal, gst_amount, total_amount } = calculateTotals(services, parts);
      expect(subtotal).toBe(150000);
      expect(gst_amount).toBe(27000);
      expect(total_amount).toBe(177000);
    });
  });

  // ── Empty inputs ─────────────────────────────────────────────────────────────
  describe('empty / missing inputs', () => {
    it('returns zeros when called with no arguments', () => {
      const { subtotal, gst_amount, total_amount } = calculateTotals();
      expect(subtotal).toBe(0);
      expect(gst_amount).toBe(0);
      expect(total_amount).toBe(0);
    });

    it('returns zeros for empty arrays', () => {
      const result = calculateTotals([], []);
      expect(result).toEqual({ subtotal: 0, gst_amount: 0, total_amount: 0 });
    });

    it('handles empty services with real parts', () => {
      const { subtotal } = calculateTotals([], [{ source_type: 'inventory', total_price: 200 }]);
      expect(subtotal).toBe(200);
    });

    it('handles real services with empty parts', () => {
      const { subtotal } = calculateTotals([{ labour_charge: 400 }], []);
      expect(subtotal).toBe(400);
    });
  });

  // ── GST precision ────────────────────────────────────────────────────────────
  describe('GST amount rounding', () => {
    it('rounds gst_amount to nearest integer', () => {
      // subtotal 1 → gst 0.18 → rounds to 0
      const { gst_amount } = calculateTotals([{ labour_charge: 1 }], []);
      expect(Number.isInteger(gst_amount)).toBe(true);
    });

    it('gst_amount + subtotal always equals total_amount', () => {
      for (const charge of [777, 1, 33, 9999, 12345]) {
        const { subtotal, gst_amount, total_amount } = calculateTotals([{ labour_charge: charge }], []);
        expect(subtotal + gst_amount).toBe(total_amount);
      }
    });

    it('returns correct shape with all three keys', () => {
      const result = calculateTotals([{ labour_charge: 100 }], []);
      expect(result).toHaveProperty('subtotal');
      expect(result).toHaveProperty('gst_amount');
      expect(result).toHaveProperty('total_amount');
    });
  });
});
