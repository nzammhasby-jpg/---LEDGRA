import { roundMoney } from './taxCalculation';

export interface OriginalLineForReturn {
  quantity: number | string;
  unitPrice?: number | string;
  unit_price?: number | string;
  unit_cost?: number | string;
  discount_amount?: number | string;
  discountAmount?: number | string;
  tax_rate?: number | string;
  taxRate?: number | string;
  tax_amount?: number | string;
  taxAmount?: number | string;
  line_total?: number | string;
  lineTotal?: number | string;
}

export interface ReturnCalculationInput {
  originalLine: OriginalLineForReturn;
  returnedQuantity: number | string;
  prevApprovedReturnedQty?: number | string;
  prevApprovedReturnedSubtotal?: number | string;
  prevApprovedReturnedTax?: number | string;
  prevApprovedReturnedTotal?: number | string;
}

export interface ReturnCalculationResult {
  returnedQuantity: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  returnRatio: number;
  hasDiscount: boolean;
  originalDiscountAmount: number;
}

/**
 * Calculates return line values (subtotal before tax, tax amount, total amount)
 * taking into account the original line's discount, tax, and line total.
 * Also handles rounding and cumulative returns for the last remaining quantity.
 */
export function calculateReturnLine(input: ReturnCalculationInput): ReturnCalculationResult {
  const line = input.originalLine;
  const origQty = Math.max(0, Number(line.quantity) || 0);

  const origTax = Math.max(
    0,
    Number(line.tax_amount !== undefined ? line.tax_amount : line.taxAmount) || 0
  );

  const origTotal = Math.max(
    0,
    Number(line.line_total !== undefined ? line.line_total : line.lineTotal) || 0
  );

  const origDiscount = Math.max(
    0,
    Number(line.discount_amount !== undefined ? line.discount_amount : line.discountAmount) || 0
  );

  // Original net before tax (line_total minus tax_amount)
  const origNetBeforeTax = origQty > 0 ? roundMoney(origTotal - origTax, 2) : 0;

  const rawReturnQty = Math.max(0, Number(input.returnedQuantity) || 0);

  const prevQty = Math.max(0, Number(input.prevApprovedReturnedQty) || 0);
  const prevSubtotal = Math.max(0, Number(input.prevApprovedReturnedSubtotal) || 0);
  const prevTax = Math.max(0, Number(input.prevApprovedReturnedTax) || 0);
  const prevTotal = Math.max(0, Number(input.prevApprovedReturnedTotal) || 0);

  const availableQty = Math.max(0, origQty - prevQty);
  // Prevent returning more than available quantity
  const returnQty = Math.min(rawReturnQty, availableQty);

  if (origQty === 0 || returnQty === 0 || availableQty === 0) {
    return {
      returnedQuantity: 0,
      subtotal: 0,
      taxAmount: 0,
      totalAmount: 0,
      returnRatio: 0,
      hasDiscount: origDiscount > 0,
      originalDiscountAmount: origDiscount,
    };
  }

  // Safe floating point equality check for final return
  const isFinalReturn = Math.abs(returnQty - availableQty) < 0.00001 && prevQty > 0;

  const remainingSubtotal = Math.max(0, roundMoney(origNetBeforeTax - prevSubtotal, 2));
  const remainingTax = Math.max(0, roundMoney(origTax - prevTax, 2));
  const remainingTotal = Math.max(0, roundMoney(origTotal - prevTotal, 2));

  let subtotal = 0;
  let taxAmount = 0;
  let totalAmount = 0;
  const returnRatio = returnQty / origQty;

  if (isFinalReturn) {
    subtotal = remainingSubtotal;
    taxAmount = remainingTax;
    totalAmount = remainingTotal;
  } else {
    subtotal = Math.min(remainingSubtotal, Math.max(0, roundMoney(origNetBeforeTax * returnRatio, 2)));
    taxAmount = Math.min(remainingTax, Math.max(0, roundMoney(origTax * returnRatio, 2)));
    totalAmount = Math.min(remainingTotal, roundMoney(subtotal + taxAmount, 2));
  }

  return {
    returnedQuantity: returnQty,
    subtotal,
    taxAmount,
    totalAmount,
    returnRatio,
    hasDiscount: origDiscount > 0,
    originalDiscountAmount: origDiscount,
  };
}
