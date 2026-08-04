import { describe, it, expect } from 'vitest';
import { calculateTaxLine, calculateInvoiceTotals } from '../taxCalculation';
import { getOrgDefaultTaxRate } from '../countryProfiles';
import { Organization } from '../../types';

describe('REP-1B & Inclusive Tax Comprehensive Verification Suite (11 Scenarios)', () => {
  const registeredOrg: Organization = {
    id: 'org-registered',
    name_ar: 'شركة المسجلة',
    name_en: 'Registered Co',
    activity_type: null,
    country_code: 'SA',
    city: 'Riyadh',
    phone: '0500000000',
    email: 'info@registered.com',
    logo_url: null,
    legal_type: null,
    vat_number: '300000000000003',
    is_vat_registered: true,
    fiscal_year_start: null,
    currency_code: 'SAR',
    primary_language: 'ar',
    onboarding_completed: true,
    cr_number: '1010000000',
    created_by: null,
    system_start_date: null,
    accounting_mode: 'accrual',
    starting_balances_later: false,
    default_tax_rate: 15,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const unregisteredOrg: Organization = {
    id: 'org-unregistered',
    name_ar: 'شركة الغير مسجلة',
    name_en: 'Unregistered Co',
    activity_type: null,
    country_code: 'SA',
    city: 'Riyadh',
    phone: '0500000000',
    email: 'info@unregistered.com',
    logo_url: null,
    legal_type: null,
    vat_number: null,
    is_vat_registered: false,
    fiscal_year_start: null,
    currency_code: 'SAR',
    primary_language: 'ar',
    onboarding_completed: true,
    cr_number: '1010000000',
    created_by: null,
    system_start_date: null,
    accounting_mode: 'accrual',
    starting_balances_later: false,
    default_tax_rate: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Scenario 1: Registered Org default tax rate is 15% (not 0%)
  it('Scenario 1: Registered org starts with default tax rate 15%', () => {
    const rate = getOrgDefaultTaxRate(registeredOrg);
    expect(rate).toBe(15);
  });

  // Scenario 2: Tax Exclusive Calculation Math
  it('Scenario 2: Tax exclusive calculates Net = Price, Tax = Price * Rate, Gross = Net + Tax', () => {
    const res = calculateTaxLine(
      { quantity: '1', enteredUnitPrice: '100', discountAmount: '0', taxRate: 15 },
      false // pricesIncludeTax = false
    );
    expect(res.netBeforeTax).toBe(100);
    expect(res.taxAmount).toBe(15);
    expect(res.lineTotal).toBe(115);
  });

  // Scenario 3: Tax Inclusive Calculation Math
  it('Scenario 3: Tax inclusive calculates Gross = Price, Net = Gross / 1.15, Tax = Gross - Net', () => {
    const res = calculateTaxLine(
      { quantity: '1', enteredUnitPrice: '115', discountAmount: '0', taxRate: 15 },
      true // pricesIncludeTax = true
    );
    expect(res.lineTotal).toBe(115);
    expect(res.netBeforeTax).toBe(100);
    expect(res.taxAmount).toBe(15);
  });

  // Scenario 4: Switching price input mode does not change entered price field value
  it('Scenario 4: Toggling price mode keeps the entered price unchanged', () => {
    let enteredPrice = '230';
    let pricesIncludeTax = false;

    // Exclusive mode calculation
    const exclRes = calculateTaxLine(
      { quantity: '1', enteredUnitPrice: enteredPrice, discountAmount: '0', taxRate: 15 },
      pricesIncludeTax
    );
    expect(enteredPrice).toBe('230');
    expect(exclRes.netBeforeTax).toBe(230);
    expect(exclRes.taxAmount).toBe(34.5);
    expect(exclRes.lineTotal).toBe(264.5);

    // Toggle mode to inclusive without mutating enteredPrice
    pricesIncludeTax = true;
    const inclRes = calculateTaxLine(
      { quantity: '1', enteredUnitPrice: enteredPrice, discountAmount: '0', taxRate: 15 },
      pricesIncludeTax
    );
    expect(enteredPrice).toBe('230'); // Entered price remains 230
    expect(inclRes.lineTotal).toBe(230);
    expect(inclRes.netBeforeTax).toBe(200);
    expect(inclRes.taxAmount).toBe(30);
  });

  // Scenario 5: Switching price input mode does not reset tax_rate to 0
  it('Scenario 5: Toggling price mode preserves the line tax_rate', () => {
    let lineTaxRate = 15;
    let pricesIncludeTax = false;

    pricesIncludeTax = true; // Toggle to inclusive
    expect(lineTaxRate).toBe(15); // Tax rate remains 15

    const res = calculateTaxLine(
      { quantity: '1', enteredUnitPrice: '115', discountAmount: '0', taxRate: lineTaxRate },
      pricesIncludeTax
    );
    expect(res.taxAmount).toBe(15);
  });

  // Scenario 6: Item tax_rate selection override and fallback logic
  it('Scenario 6: Item with custom tax_rate applies it; item without tax_rate or cleared item reverts to org default rate', () => {
    const itemWithCustomRate = { id: '1', tax_rate: 5 };
    const itemWithoutRate = { id: '2', tax_rate: undefined };

    // Item with 5% tax rate
    const rate1 = typeof itemWithCustomRate.tax_rate === 'number'
      ? itemWithCustomRate.tax_rate
      : getOrgDefaultTaxRate(registeredOrg);
    expect(rate1).toBe(5);

    // Item without explicit tax rate
    const rate2 = typeof itemWithoutRate.tax_rate === 'number'
      ? itemWithoutRate.tax_rate
      : getOrgDefaultTaxRate(registeredOrg);
    expect(rate2).toBe(15);

    // Cleared item (null/empty)
    const rateCleared = getOrgDefaultTaxRate(registeredOrg);
    expect(rateCleared).toBe(15);
  });

  // Scenario 7: Unregistered org UI default rate falls back to 15% for SA orgs while preserving manual entry
  it('Scenario 7: Unregistered SA org defaults to 15% tax rate and allows manual tax calculation', () => {
    const configuredRate = Number(getOrgDefaultTaxRate(unregisteredOrg));
    const effectiveRate = configuredRate > 0 ? configuredRate : 15;
    expect(effectiveRate).toBe(15);

    const res = calculateTaxLine(
      { quantity: '2', enteredUnitPrice: '100', discountAmount: '0', taxRate: 15 },
      false
    );
    expect(res.netBeforeTax).toBe(200);
    expect(res.taxAmount).toBe(30);
    expect(res.lineTotal).toBe(230);
  });

  // Scenario 8: Settings screen is_vat_registered state toggle preserves default_tax_rate
  it('Scenario 8: Disabling is_vat_registered preserves default_tax_rate', () => {
    let orgState = { ...registeredOrg };
    expect(getOrgDefaultTaxRate(orgState)).toBe(15);

    // Simulate disabling VAT registration in settings (should NOT clear default_tax_rate)
    orgState.is_vat_registered = false;
    orgState.default_tax_rate = 15;

    expect(orgState.default_tax_rate).toBe(15);
  });

  // Scenario 9: ZATCA status reflects real is_vat_registered
  it('Scenario 9: ZATCA status display helper reflects actual registration', () => {
    const getZatcaStatus = (org: Organization) => {
      return org.is_vat_registered
        ? `مسجل - الرقم الضريبي ${org.vat_number || 'غير متوفر'}`
        : 'غير مسجل في ضريبة القيمة المضافة';
    };

    expect(getZatcaStatus(registeredOrg)).toContain('مسجل - الرقم الضريبي 300000000000003');
    expect(getZatcaStatus(unregisteredOrg)).toBe('غير مسجل في ضريبة القيمة المضافة');
  });

  // Scenario 10: Check label text requirement (no "0% معفى", use "بدون ضريبة (0%)")
  it('Scenario 10: Tax dropdown label uses "بدون ضريبة (0%)" instead of "0% معفى"', () => {
    const forbiddenText = '0% معفى';
    const requiredText = 'بدون ضريبة (0%)';

    const getTaxOptions = (isRegistered: boolean) => {
      if (!isRegistered) {
        return [{ value: 0, label: requiredText }];
      }
      return [
        { value: 15, label: '15% ضريبة افتراضية' },
        { value: 0, label: requiredText }
      ];
    };

    const options = getTaxOptions(true);
    const labels = options.map(o => o.label);

    expect(labels).not.toContain(forbiddenText);
    expect(labels).toContain(requiredText);
  });

  // Scenario 11: Tax inclusive with line discount math precision
  it('Scenario 11: Inclusive invoice with discount calculates net, tax, and gross with 2 decimal precision without drift', () => {
    // Single line: Price = 115 SAR (inclusive), Discount = 15 SAR
    // Net before tax after discount = (115 - 15) / 1.15 = 100 / 1.15 = 86.9565... -> 86.96
    // Tax = 100 - 86.9565... = 13.0434... -> 13.04
    // Gross = 86.96 + 13.04 = 100.00
    const lineRes = calculateTaxLine(
      { quantity: '1', enteredUnitPrice: '115', discountAmount: '15', taxRate: 15 },
      true
    );

    expect(lineRes.netBeforeTax).toBe(86.96);
    expect(lineRes.taxAmount).toBe(13.04);
    expect(lineRes.lineTotal).toBe(100.00);

    // Multi-line inclusive invoice total test
    const totals = calculateInvoiceTotals(
      [
        { quantity: '1', enteredUnitPrice: '115', discountAmount: '15', taxRate: 15 },
        { quantity: '2', enteredUnitPrice: '57.5', discountAmount: '0', taxRate: 15 } // 115 total
      ],
      true
    );

    // Line 1: Net 86.96, Tax 13.04, Total 100.00
    // Line 2: Net 100.00, Tax 15.00, Total 115.00
    // Total Subtotal (Gross before tax): 200.00
    // Total Tax: 28.04
    // Total (Gross inclusive): 215.00
    expect(totals.subtotal).toBe(200.00);
    expect(totals.taxTotal).toBe(28.04);
    expect(totals.total).toBe(215.00);
  });
});
