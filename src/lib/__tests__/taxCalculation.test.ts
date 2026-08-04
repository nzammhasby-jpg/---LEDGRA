import { describe, it, expect } from 'vitest';
import { calculateTaxLine, calculateInvoiceTotals } from '../taxCalculation';

describe('Tax Calculation Helpers', () => {
  it('1. Exclusive Sales: Qty 1, Price 100, Tax 15%', () => {
    const res = calculateTaxLine(
      { quantity: 1, enteredUnitPrice: 100, discountAmount: 0, taxRate: 15 },
      false
    );
    expect(res.netBeforeTax).toBe(100);
    expect(res.taxAmount).toBe(15);
    expect(res.lineTotal).toBe(115);
  });

  it('2. Inclusive Sales: Qty 1, Inclusive Price 115, Tax 15%', () => {
    const res = calculateTaxLine(
      { quantity: 1, enteredUnitPrice: 115, discountAmount: 0, taxRate: 15 },
      true
    );
    expect(res.netBeforeTax).toBe(100);
    expect(res.taxAmount).toBe(15);
    expect(res.lineTotal).toBe(115);
  });

  it('3. Inclusive Sales with Quantity: Qty 2, Inclusive Unit Price 115, Tax 15%', () => {
    const res = calculateTaxLine(
      { quantity: 2, enteredUnitPrice: 115, discountAmount: 0, taxRate: 15 },
      true
    );
    expect(res.netBeforeTax).toBe(200);
    expect(res.taxAmount).toBe(30);
    expect(res.lineTotal).toBe(230);
  });

  it('4. Inclusive Sales with Discount: Qty 2, Inclusive Unit Price 115, Discount 23, Tax 15%', () => {
    const res = calculateTaxLine(
      { quantity: 2, enteredUnitPrice: 115, discountAmount: 23, taxRate: 15 },
      true
    );
    expect(res.netInclusive).toBe(207);
    expect(res.netBeforeTax).toBe(180);
    expect(res.taxAmount).toBe(27);
    expect(res.lineTotal).toBe(207);
  });

  it('5. Zero Tax Rate', () => {
    const res = calculateTaxLine(
      { quantity: 1, enteredUnitPrice: 100, discountAmount: 0, taxRate: 0 },
      true
    );
    expect(res.netBeforeTax).toBe(100);
    expect(res.taxAmount).toBe(0);
    expect(res.lineTotal).toBe(100);
  });

  it('6. Rounding Differences: Price 99.99, Qty 3, Tax 15%', () => {
    const resExclusive = calculateTaxLine(
      { quantity: 3, enteredUnitPrice: 99.99, discountAmount: 0, taxRate: 15 },
      false
    );
    expect(resExclusive.netBeforeTax).toBe(299.97);
    expect(resExclusive.taxAmount).toBe(45);
    expect(resExclusive.lineTotal).toBe(344.97);

    const resInclusive = calculateTaxLine(
      { quantity: 3, enteredUnitPrice: 99.99, discountAmount: 0, taxRate: 15 },
      true
    );
    // grossInclusive = 299.97
    // netBeforeTax = round(299.97 / 1.15, 2) = 260.84
    // taxAmount = 299.97 - 260.84 = 39.13
    expect(resInclusive.grossInclusive).toBe(299.97);
    expect(resInclusive.netBeforeTax).toBe(260.84);
    expect(resInclusive.taxAmount).toBe(39.13);
    expect(resInclusive.lineTotal).toBe(299.97);
  });

  it('7. Backward Compatibility: Default false acts as exclusive', () => {
    const totals = calculateInvoiceTotals(
      [
        { quantity: 1, enteredUnitPrice: 100, discountAmount: 0, taxRate: 15 },
        { quantity: 2, enteredUnitPrice: 50, discountAmount: 10, taxRate: 15 }
      ],
      false
    );
    // Line 1: net 100, tax 15, total 115
    // Line 2: net 90, tax 13.5, total 103.5
    // Subtotal: 200, Discount: 10, Tax: 28.5, Total: 218.5
    expect(totals.subtotal).toBe(200);
    expect(totals.discountTotal).toBe(10);
    expect(totals.taxTotal).toBe(28.5);
    expect(totals.total).toBe(218.5);
    expect(totals.subtotal - totals.discountTotal + totals.taxTotal).toBe(totals.total);
  });
});
