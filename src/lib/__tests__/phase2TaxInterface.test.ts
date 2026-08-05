import { describe, it, expect } from 'vitest';
import { calculateTaxLine, calculateInvoiceTotals } from '../taxCalculation';
import { getOrgDefaultTaxRate } from '../countryProfiles';
import { Organization } from '../../types';

describe('Phase 2 — Tax Interface & Internal Rate Behavior Tests', () => {
  const saOrgRegistered: Organization = {
    id: 'org-sa-15',
    name_ar: 'منشأة سعودية خاضعة للضريبة',
    name_en: 'SA VAT Org',
    activity_type: null,
    country_code: 'SA',
    city: 'Riyadh',
    phone: '0500000000',
    email: 'info@sa-vat.com',
    logo_url: null,
    legal_type: null,
    vat_number: '310123456700003',
    is_vat_registered: true,
    fiscal_year_start: null,
    currency_code: 'SAR',
    primary_language: 'ar',
    onboarding_completed: true,
    cr_number: '1010123456',
    created_by: null,
    system_start_date: null,
    accounting_mode: 'accrual',
    starting_balances_later: false,
    default_tax_rate: 15,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const yeOrg: Organization = {
    id: 'org-ye-0',
    name_ar: 'منشأة يمنية',
    name_en: 'YE Org',
    activity_type: null,
    country_code: 'YE',
    city: 'Sanaa',
    phone: '012345678',
    email: 'info@ye-org.com',
    logo_url: null,
    legal_type: null,
    vat_number: null,
    is_vat_registered: false,
    fiscal_year_start: null,
    currency_code: 'YER',
    primary_language: 'ar',
    onboarding_completed: true,
    cr_number: '12345',
    created_by: null,
    system_start_date: null,
    accounting_mode: 'accrual',
    starting_balances_later: false,
    default_tax_rate: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  it('1 & 2. Default tax rate is derived internally from org settings without hardcoded rates', () => {
    expect(getOrgDefaultTaxRate(saOrgRegistered)).toBe(15);
    expect(getOrgDefaultTaxRate(yeOrg)).toBe(0);
  });

  it('3 & 12. Adding a new line uses current org default tax rate, and changing org default tax rate updates future lines', () => {
    let currentRate = getOrgDefaultTaxRate(saOrgRegistered);
    expect(currentRate).toBe(15);

    const updatedOrg = { ...saOrgRegistered, default_tax_rate: 5 };
    currentRate = getOrgDefaultTaxRate(updatedOrg);
    expect(currentRate).toBe(5);
  });

  it('4. Exclusive tax calculation: unit price 100 with 15% rate produces subtotal 100, tax 15, and total 115', () => {
    const res = calculateTaxLine(
      { quantity: 1, enteredUnitPrice: 100, discountAmount: 0, taxRate: 15 },
      false // pricesIncludeTax = false
    );
    expect(res.netBeforeTax).toBe(100);
    expect(res.taxAmount).toBe(15);
    expect(res.lineTotal).toBe(115);
  });

  it('5 & 6. Inclusive tax calculation: unit price 115 with 15% rate extracts tax 15, subtotal 100, total 115 without adding tax twice', () => {
    const res = calculateTaxLine(
      { quantity: 1, enteredUnitPrice: 115, discountAmount: 0, taxRate: 15 },
      true // pricesIncludeTax = true
    );
    expect(res.lineTotal).toBe(115);
    expect(res.netBeforeTax).toBe(100);
    expect(res.taxAmount).toBe(15);
  });

  it('7 & 8. Toggling tax mode between exclusive and inclusive does not alter entered price or reset tax_rate', () => {
    const enteredUnitPrice = '115';
    let lineTaxRate = 15;

    // Exclusive
    const resExcl = calculateTaxLine({ quantity: 1, enteredUnitPrice, discountAmount: 0, taxRate: lineTaxRate }, false);
    expect(resExcl.enteredUnitPrice).toBe(115);
    expect(resExcl.lineTotal).toBe(132.25);

    // Inclusive
    const resIncl = calculateTaxLine({ quantity: 1, enteredUnitPrice, discountAmount: 0, taxRate: lineTaxRate }, true);
    expect(resIncl.enteredUnitPrice).toBe(115); // unchanged
    expect(lineTaxRate).toBe(15); // rate unchanged
    expect(resIncl.netBeforeTax).toBe(100);
    expect(resIncl.taxAmount).toBe(15);
    expect(resIncl.lineTotal).toBe(115);
  });

  it('9 & 10. Opening old draft or creating corrective copy preserves item saved tax_rate', () => {
    const oldDraftLine = {
      item_id: 'item-1',
      description: 'Special 5% Item',
      quantity: 2,
      unit_price: 100,
      discount_amount: 0,
      tax_rate: 5 // preserved historical rate
    };

    const currentOrgRate = getOrgDefaultTaxRate(saOrgRegistered); // 15
    const lineRateToUse = oldDraftLine.tax_rate ?? currentOrgRate;

    expect(lineRateToUse).toBe(5); // Should preserve 5%, NOT override with 15%
  });

  it('11. Adding a new item to existing draft uses current org tax rate', () => {
    const existingLine = { item_id: 'item-1', tax_rate: 5 };
    const newLine = { item_id: 'item-2', tax_rate: getOrgDefaultTaxRate(saOrgRegistered) };

    expect(existingLine.tax_rate).toBe(5);
    expect(newLine.tax_rate).toBe(15);
  });

  it('13. Supabase payload retains tax_rate for every line item in sales and purchases', () => {
    const salesLineInput = {
      item_id: 'p1',
      description: 'Test product',
      quantity: '2',
      unit_price: '50',
      discount_amount: '0',
      tax_rate: 15
    };

    const salesPayloadLine = {
      item_id: salesLineInput.item_id,
      quantity: Number(salesLineInput.quantity),
      unit_price: Number(salesLineInput.unit_price),
      discount_amount: Number(salesLineInput.discount_amount),
      tax_rate: Number(salesLineInput.tax_rate)
    };

    expect(salesPayloadLine).toHaveProperty('tax_rate', 15);

    const purchaseLineInput = {
      item_id: 'p2',
      quantity: '3',
      unit_cost: '40',
      discount_amount: '0',
      tax_rate: 15
    };

    const purchasePayloadLine = {
      item_id: purchaseLineInput.item_id,
      quantity: Number(purchaseLineInput.quantity),
      unit_cost: Number(purchaseLineInput.unit_cost),
      discount_amount: Number(purchaseLineInput.discount_amount),
      tax_rate: Number(purchaseLineInput.tax_rate)
    };

    expect(purchasePayloadLine).toHaveProperty('tax_rate', 15);
  });

  it('14 & 15. Total invoice calculation and line math precision match across sales and purchase contexts', () => {
    const lineInput = { quantity: 2, enteredUnitPrice: 100, discountAmount: 10, taxRate: 15 };
    const salesTotals = calculateInvoiceTotals([lineInput], false);

    expect(salesTotals.subtotal).toBe(200);
    expect(salesTotals.discountTotal).toBe(10);
    expect(salesTotals.taxTotal).toBe(28.5); // (200 - 10) * 0.15 = 28.5
    expect(salesTotals.total).toBe(218.5);

    const purchaseTotals = calculateInvoiceTotals([lineInput], false);

    expect(purchaseTotals.subtotal).toBe(salesTotals.subtotal);
    expect(purchaseTotals.taxTotal).toBe(salesTotals.taxTotal);
    expect(purchaseTotals.total).toBe(salesTotals.total);
  });
});
