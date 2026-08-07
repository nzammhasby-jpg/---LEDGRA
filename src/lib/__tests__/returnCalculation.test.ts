import { describe, it, expect } from 'vitest';
import { calculateReturnLine } from '../returnCalculation';

describe('Phase 3 - Sales Credit Note & Purchase Debit Note Return Calculation Test Suite (24 Scenarios)', () => {

  // ==========================================================================
  // Group A: Basic Returns without Discount
  // ==========================================================================
  describe('Group A: Basic Returns without Discount', () => {
    it('1. Full return on 1 item (price 100, 15% tax exclusive)', () => {
      const result = calculateReturnLine({
        originalLine: {
          quantity: 1,
          unitPrice: 100,
          discountAmount: 0,
          taxRate: 15,
          taxAmount: 15,
          lineTotal: 115,
        },
        returnedQuantity: 1,
      });

      expect(result.subtotal).toBe(100);
      expect(result.taxAmount).toBe(15);
      expect(result.totalAmount).toBe(115);
    });

    it('2. Partial return 1 out of 2 items (price 100 each, 15% tax exclusive)', () => {
      const result = calculateReturnLine({
        originalLine: {
          quantity: 2,
          unitPrice: 100,
          discountAmount: 0,
          taxRate: 15,
          taxAmount: 30,
          lineTotal: 230,
        },
        returnedQuantity: 1,
      });

      expect(result.subtotal).toBe(100);
      expect(result.taxAmount).toBe(15);
      expect(result.totalAmount).toBe(115);
    });

    it('3. Full return on 5 items (price 50 each, 15% tax exclusive)', () => {
      const result = calculateReturnLine({
        originalLine: {
          quantity: 5,
          unitPrice: 50,
          discountAmount: 0,
          taxRate: 15,
          taxAmount: 37.50,
          lineTotal: 287.50,
        },
        returnedQuantity: 5,
      });

      expect(result.subtotal).toBe(250);
      expect(result.taxAmount).toBe(37.50);
      expect(result.totalAmount).toBe(287.50);
    });

    it('4. Partial return 2 out of 5 items (price 50 each, 15% tax exclusive)', () => {
      const result = calculateReturnLine({
        originalLine: {
          quantity: 5,
          unitPrice: 50,
          discountAmount: 0,
          taxRate: 15,
          taxAmount: 37.50,
          lineTotal: 287.50,
        },
        returnedQuantity: 2,
      });

      expect(result.subtotal).toBe(100);
      expect(result.taxAmount).toBe(15);
      expect(result.totalAmount).toBe(115);
    });

    it('5. Full return on 1 item (price 100, 0% tax)', () => {
      const result = calculateReturnLine({
        originalLine: {
          quantity: 1,
          unitPrice: 100,
          discountAmount: 0,
          taxRate: 0,
          taxAmount: 0,
          lineTotal: 100,
        },
        returnedQuantity: 1,
      });

      expect(result.subtotal).toBe(100);
      expect(result.taxAmount).toBe(0);
      expect(result.totalAmount).toBe(100);
    });

    it('6. Partial return 1 out of 2 items (price 100 each, 0% tax)', () => {
      const result = calculateReturnLine({
        originalLine: {
          quantity: 2,
          unitPrice: 100,
          discountAmount: 0,
          taxRate: 0,
          taxAmount: 0,
          lineTotal: 200,
        },
        returnedQuantity: 1,
      });

      expect(result.subtotal).toBe(100);
      expect(result.taxAmount).toBe(0);
      expect(result.totalAmount).toBe(100);
    });
  });

  // ==========================================================================
  // Group B: Returns WITH Discount (Tax Exclusive)
  // ==========================================================================
  describe('Group B: Returns WITH Discount (Tax Exclusive)', () => {
    it('7. Full return on 2 items (price 100, discount 20, 15% tax)', () => {
      // Original: 2 * 100 = 200, discount 20 => Net 180, Tax 27, Total 207
      const result = calculateReturnLine({
        originalLine: {
          quantity: 2,
          unitPrice: 100,
          discountAmount: 20,
          taxRate: 15,
          taxAmount: 27,
          lineTotal: 207,
        },
        returnedQuantity: 2,
      });

      expect(result.subtotal).toBe(180);
      expect(result.taxAmount).toBe(27);
      expect(result.totalAmount).toBe(207);
    });

    it('8. Partial return 1 out of 2 items (price 100, discount 20, 15% tax)', () => {
      const result = calculateReturnLine({
        originalLine: {
          quantity: 2,
          unitPrice: 100,
          discountAmount: 20,
          taxRate: 15,
          taxAmount: 27,
          lineTotal: 207,
        },
        returnedQuantity: 1,
      });

      expect(result.subtotal).toBe(90);
      expect(result.taxAmount).toBe(13.50);
      expect(result.totalAmount).toBe(103.50);
    });

    it('9. Full return on 4 items (price 50, discount 40, 15% tax)', () => {
      // Original: 4 * 50 = 200, discount 40 => Net 160, Tax 24, Total 184
      const result = calculateReturnLine({
        originalLine: {
          quantity: 4,
          unitPrice: 50,
          discountAmount: 40,
          taxRate: 15,
          taxAmount: 24,
          lineTotal: 184,
        },
        returnedQuantity: 4,
      });

      expect(result.subtotal).toBe(160);
      expect(result.taxAmount).toBe(24);
      expect(result.totalAmount).toBe(184);
    });

    it('10. Partial return 1 out of 4 items (price 50, discount 40, 15% tax)', () => {
      const result = calculateReturnLine({
        originalLine: {
          quantity: 4,
          unitPrice: 50,
          discountAmount: 40,
          taxRate: 15,
          taxAmount: 24,
          lineTotal: 184,
        },
        returnedQuantity: 1,
      });

      expect(result.subtotal).toBe(40);
      expect(result.taxAmount).toBe(6);
      expect(result.totalAmount).toBe(46);
    });

    it('11. Partial return 3 out of 4 items (price 50, discount 40, 15% tax)', () => {
      const result = calculateReturnLine({
        originalLine: {
          quantity: 4,
          unitPrice: 50,
          discountAmount: 40,
          taxRate: 15,
          taxAmount: 24,
          lineTotal: 184,
        },
        returnedQuantity: 3,
      });

      expect(result.subtotal).toBe(120);
      expect(result.taxAmount).toBe(18);
      expect(result.totalAmount).toBe(138);
    });

    it('12. Full return on 2 items (price 100, discount 50, 0% tax)', () => {
      // Original: 2 * 100 = 200, discount 50 => Net 150, Tax 0, Total 150
      const result = calculateReturnLine({
        originalLine: {
          quantity: 2,
          unitPrice: 100,
          discountAmount: 50,
          taxRate: 0,
          taxAmount: 0,
          lineTotal: 150,
        },
        returnedQuantity: 2,
      });

      expect(result.subtotal).toBe(150);
      expect(result.taxAmount).toBe(0);
      expect(result.totalAmount).toBe(150);
    });
  });

  // ==========================================================================
  // Group C: Returns on Tax Inclusive Invoices
  // ==========================================================================
  describe('Group C: Returns on Tax Inclusive Invoices', () => {
    it('13. Full return on 2 items (total inclusive 207, tax 27, net 180)', () => {
      const result = calculateReturnLine({
        originalLine: {
          quantity: 2,
          taxAmount: 27,
          lineTotal: 207,
        },
        returnedQuantity: 2,
      });

      expect(result.subtotal).toBe(180);
      expect(result.taxAmount).toBe(27);
      expect(result.totalAmount).toBe(207);
    });

    it('14. Partial return 1 out of 2 items (total inclusive 207, tax 27, net 180)', () => {
      const result = calculateReturnLine({
        originalLine: {
          quantity: 2,
          taxAmount: 27,
          lineTotal: 207,
        },
        returnedQuantity: 1,
      });

      expect(result.subtotal).toBe(90);
      expect(result.taxAmount).toBe(13.50);
      expect(result.totalAmount).toBe(103.50);
    });

    it('15. Full return on 1 item (total inclusive 115, tax 15, net 100)', () => {
      const result = calculateReturnLine({
        originalLine: {
          quantity: 1,
          taxAmount: 15,
          lineTotal: 115,
        },
        returnedQuantity: 1,
      });

      expect(result.subtotal).toBe(100);
      expect(result.taxAmount).toBe(15);
      expect(result.totalAmount).toBe(115);
    });

    it('16. Partial return 1 out of 3 items (total inclusive 345, tax 45, net 300)', () => {
      const result = calculateReturnLine({
        originalLine: {
          quantity: 3,
          taxAmount: 45,
          lineTotal: 345,
        },
        returnedQuantity: 1,
      });

      expect(result.subtotal).toBe(100);
      expect(result.taxAmount).toBe(15);
      expect(result.totalAmount).toBe(115);
    });

    it('17. Full return on 2 items with discount (tax inclusive total 207, tax 27)', () => {
      const result = calculateReturnLine({
        originalLine: {
          quantity: 2,
          discountAmount: 20,
          taxAmount: 27,
          lineTotal: 207,
        },
        returnedQuantity: 2,
      });

      expect(result.subtotal).toBe(180);
      expect(result.taxAmount).toBe(27);
      expect(result.totalAmount).toBe(207);
    });

    it('18. Partial return 1 out of 2 items with discount (tax inclusive total 207, tax 27)', () => {
      const result = calculateReturnLine({
        originalLine: {
          quantity: 2,
          discountAmount: 20,
          taxAmount: 27,
          lineTotal: 207,
        },
        returnedQuantity: 1,
      });

      expect(result.subtotal).toBe(90);
      expect(result.taxAmount).toBe(13.50);
      expect(result.totalAmount).toBe(103.50);
    });
  });

  // ==========================================================================
  // Group D: Consecutive Partial Returns & Penny Rounding Integrity
  // ==========================================================================
  describe('Group D: Consecutive Partial Returns & Penny Rounding Integrity', () => {
    it('19. First partial return 1 out of 2 items (Net 180, Tax 27, Total 207)', () => {
      const r1 = calculateReturnLine({
        originalLine: {
          quantity: 2,
          taxAmount: 27,
          lineTotal: 207,
        },
        returnedQuantity: 1,
        prevApprovedReturnedQty: 0,
        prevApprovedReturnedSubtotal: 0,
        prevApprovedReturnedTax: 0,
        prevApprovedReturnedTotal: 0,
      });

      expect(r1.subtotal).toBe(90);
      expect(r1.taxAmount).toBe(13.50);
      expect(r1.totalAmount).toBe(103.50);
    });

    it('20. Second partial return (last remaining 1 unit out of 2) eliminates rounding gap', () => {
      const r2 = calculateReturnLine({
        originalLine: {
          quantity: 2,
          taxAmount: 27,
          lineTotal: 207,
        },
        returnedQuantity: 1,
        prevApprovedReturnedQty: 1,
        prevApprovedReturnedSubtotal: 90,
        prevApprovedReturnedTax: 13.50,
        prevApprovedReturnedTotal: 103.50,
      });

      expect(r2.subtotal).toBe(90);
      expect(r2.taxAmount).toBe(13.50);
      expect(r2.totalAmount).toBe(103.50);
      expect(90 + r2.subtotal).toBe(180);
      expect(13.50 + r2.taxAmount).toBe(27);
      expect(103.50 + r2.totalAmount).toBe(207);
    });

    it('21. First partial return 1 out of 3 items with odd fraction (Net 100, Tax 15, Total 115)', () => {
      const r1 = calculateReturnLine({
        originalLine: {
          quantity: 3,
          taxAmount: 15,
          lineTotal: 115,
        },
        returnedQuantity: 1,
        prevApprovedReturnedQty: 0,
      });

      expect(r1.subtotal).toBe(33.33);
      expect(r1.taxAmount).toBe(5.00);
      expect(r1.totalAmount).toBe(38.33);
    });

    it('22. Second partial return 1 out of 3 items', () => {
      const r2 = calculateReturnLine({
        originalLine: {
          quantity: 3,
          taxAmount: 15,
          lineTotal: 115,
        },
        returnedQuantity: 1,
        prevApprovedReturnedQty: 1,
        prevApprovedReturnedSubtotal: 33.33,
        prevApprovedReturnedTax: 5.00,
        prevApprovedReturnedTotal: 38.33,
      });

      expect(r2.subtotal).toBe(33.33);
      expect(r2.taxAmount).toBe(5.00);
      expect(r2.totalAmount).toBe(38.33);
    });

    it('23. Third partial return (last 1 out of 3) uses exact remaining balance', () => {
      const r3 = calculateReturnLine({
        originalLine: {
          quantity: 3,
          taxAmount: 15,
          lineTotal: 115,
        },
        returnedQuantity: 1,
        prevApprovedReturnedQty: 2,
        prevApprovedReturnedSubtotal: 66.66,
        prevApprovedReturnedTax: 10.00,
        prevApprovedReturnedTotal: 76.66,
      });

      expect(r3.subtotal).toBe(33.34);
      expect(r3.taxAmount).toBe(5.00);
      expect(r3.totalAmount).toBe(38.34);

      // Verify cumulative sum across all 3 returns equals exact original totals
      expect(33.33 + 33.33 + r3.subtotal).toBe(100.00);
      expect(5.00 + 5.00 + r3.taxAmount).toBe(15.00);
      expect(38.33 + 38.33 + r3.totalAmount).toBe(115.00);
    });

    it('24. Zero / invalid quantity return returns 0', () => {
      const result = calculateReturnLine({
        originalLine: {
          quantity: 2,
          taxAmount: 27,
          lineTotal: 207,
        },
        returnedQuantity: 0,
      });

      expect(result.subtotal).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.totalAmount).toBe(0);
    });
  });

});
