import { InvoicePaymentMethod, PaymentDetails } from '../types';

export const PAYMENT_METHOD_LABELS: Record<InvoicePaymentMethod, string> = {
  cash: 'نقدي',
  credit: 'آجل',
  card: 'شبكة',
  cheque: 'شيك',
  bank_transfer: 'حوالة بنكية',
  cash_and_card: 'نقدي + شبكة',
  bank_transfer_and_cash: 'حوالة بنكية + نقدي'
};

export const CHEQUE_STATUS_LABELS: Record<string, string> = {
  received: 'مستلم',
  under_collection: 'تحت التحصيل',
  cleared: 'محصل (موقع)',
  bounced: 'مرتجع'
};

/**
 * Validates that for split payment methods (cash_and_card, bank_transfer_and_cash),
 * the sum of split amounts equals the required total paid amount.
 */
export function validatePaymentSplit(
  method: InvoicePaymentMethod,
  expectedTotal: number,
  details?: PaymentDetails
): { isValid: boolean; errorMsg?: string } {
  if (method === 'cash_and_card') {
    const cash = Number(details?.cash_amount || 0);
    const card = Number(details?.card_amount || 0);
    const sum = Math.round((cash + card) * 100) / 100;
    const exp = Math.round(expectedTotal * 100) / 100;

    if (sum !== exp) {
      return {
        isValid: false,
        errorMsg: 'مجموع مبالغ طرق السداد يجب أن يساوي المبلغ المدفوع.'
      };
    }
  }

  if (method === 'bank_transfer_and_cash') {
    const bank = Number(details?.bank_transfer_amount || 0);
    const cash = Number(details?.cash_amount || 0);
    const sum = Math.round((bank + cash) * 100) / 100;
    const exp = Math.round(expectedTotal * 100) / 100;

    if (sum !== exp) {
      return {
        isValid: false,
        errorMsg: 'مجموع مبالغ طرق السداد يجب أن يساوي المبلغ المدفوع.'
      };
    }
  }

  return { isValid: true };
}

/**
 * Returns a human-readable Arabic description of payment details for invoices/bills/quotations.
 */
export function formatPaymentDetailsSummary(
  method: InvoicePaymentMethod,
  reference?: string | null,
  details?: PaymentDetails
): string {
  const baseLabel = PAYMENT_METHOD_LABELS[method] || method;

  if (method === 'credit') {
    return 'آجل (يدفع لاحقاً في تاريخ الاستحقاق)';
  }

  const parts: string[] = [baseLabel];

  if (reference) {
    parts.push(`مرجع: ${reference}`);
  }

  if (method === 'cheque' && details) {
    if (details.cheque_number) parts.push(`رقم الشيك: ${details.cheque_number}`);
    if (details.cheque_bank_name) parts.push(`بنك: ${details.cheque_bank_name}`);
    if (details.cheque_date) parts.push(`تاريخ الشيك: ${details.cheque_date}`);
  }

  if (method === 'cash_and_card' && details) {
    parts.push(`(نقدي: ${details.cash_amount || 0} ر.س | شبكة: ${details.card_amount || 0} ر.س)`);
  }

  if (method === 'bank_transfer_and_cash' && details) {
    parts.push(`(حوالة: ${details.bank_transfer_amount || 0} ر.س | نقدي: ${details.cash_amount || 0} ر.س)`);
  }

  return parts.join(' - ');
}
