export function roundMoney(amount: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((amount + Number.EPSILON) * factor) / factor;
}

export interface TaxLineInput {
  quantity: number | string;
  enteredUnitPrice: number | string;
  discountAmount?: number | string;
  taxRate?: number | string;
}

export interface TaxLineResult {
  quantity: number;
  enteredUnitPrice: number;
  unitPriceBeforeTax: number;
  grossInclusive: number;
  grossBeforeTax: number;
  discountInclusive: number;
  discountBeforeTax: number;
  netInclusive: number;
  netBeforeTax: number;
  taxAmount: number;
  lineTotal: number;
}

export interface InvoiceTotalsResult {
  subtotal: number;       // total gross before tax
  discountTotal: number;  // total discount before tax
  taxTotal: number;       // total tax
  total: number;          // total including tax
}

/**
 * Calculates line totals according to whether prices include tax or not.
 * In inclusive mode:
 *   grossInclusive = quantity * enteredUnitPrice
 *   netInclusive = grossInclusive - discountAmount
 *   netBeforeTax = round(netInclusive / (1 + taxRate/100), 2)
 *   taxAmount = round(netInclusive - netBeforeTax, 2)
 *   lineTotal = netInclusive
 */
export function calculateTaxLine(input: TaxLineInput, pricesIncludeTax: boolean): TaxLineResult {
  const qty = Math.max(0, Number(input.quantity) || 0);
  const enteredPrice = Math.max(0, Number(input.enteredUnitPrice) || 0);
  const discount = Math.max(0, Number(input.discountAmount) || 0);
  const rate = Math.max(0, Number(input.taxRate) || 0);

  if (!pricesIncludeTax) {
    // Exclusive mode (Prices do NOT include VAT)
    const grossBeforeDiscount = roundMoney(qty * enteredPrice, 2);
    const netBeforeTax = Math.max(0, roundMoney(grossBeforeDiscount - discount, 2));
    const taxAmount = rate > 0 ? roundMoney((netBeforeTax * rate) / 100, 2) : 0;
    const lineTotal = roundMoney(netBeforeTax + taxAmount, 2);

    return {
      quantity: qty,
      enteredUnitPrice: enteredPrice,
      unitPriceBeforeTax: enteredPrice,
      grossInclusive: lineTotal,
      grossBeforeTax: grossBeforeDiscount,
      discountInclusive: roundMoney(discount + (rate > 0 ? (discount * rate) / 100 : 0), 2),
      discountBeforeTax: discount,
      netInclusive: lineTotal,
      netBeforeTax,
      taxAmount,
      lineTotal,
    };
  } else {
    // Inclusive mode (Prices DO include VAT)
    const grossInclusive = roundMoney(qty * enteredPrice, 2);
    const netInclusive = Math.max(0, roundMoney(grossInclusive - discount, 2));

    let netBeforeTax = 0;
    let taxAmount = 0;
    let grossBeforeTax = 0;
    let discountBeforeTax = 0;
    let unitPriceBeforeTax = enteredPrice;

    if (rate > 0) {
      unitPriceBeforeTax = roundMoney(enteredPrice / (1 + rate / 100), 4);
      grossBeforeTax = roundMoney(grossInclusive / (1 + rate / 100), 2);
      netBeforeTax = roundMoney(netInclusive / (1 + rate / 100), 2);
      taxAmount = roundMoney(netInclusive - netBeforeTax, 2);
      discountBeforeTax = roundMoney(grossBeforeTax - netBeforeTax, 2);
    } else {
      unitPriceBeforeTax = enteredPrice;
      grossBeforeTax = grossInclusive;
      netBeforeTax = netInclusive;
      taxAmount = 0;
      discountBeforeTax = discount;
    }

    return {
      quantity: qty,
      enteredUnitPrice: enteredPrice,
      unitPriceBeforeTax,
      grossInclusive,
      grossBeforeTax,
      discountInclusive: discount,
      discountBeforeTax,
      netInclusive,
      netBeforeTax,
      taxAmount,
      lineTotal: netInclusive,
    };
  }
}

export function calculateInvoiceTotals(
  lines: TaxLineInput[],
  pricesIncludeTax: boolean
): InvoiceTotalsResult {
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;
  let total = 0;

  for (const line of lines) {
    const res = calculateTaxLine(line, pricesIncludeTax);
    subtotal += res.grossBeforeTax;
    discountTotal += res.discountBeforeTax;
    taxTotal += res.taxAmount;
    total += res.lineTotal;
  }

  return {
    subtotal: roundMoney(subtotal, 2),
    discountTotal: roundMoney(discountTotal, 2),
    taxTotal: roundMoney(taxTotal, 2),
    total: roundMoney(total, 2),
  };
}
