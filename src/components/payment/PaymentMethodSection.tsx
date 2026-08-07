import React from 'react';
import { InvoicePaymentMethod, PaymentDetails, CashBankAccount } from '../../types';
import { PAYMENT_METHOD_LABELS, CHEQUE_STATUS_LABELS, validatePaymentSplit } from '../../lib/paymentMethodUtils';
import { CreditCard, Landmark, Wallet, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

interface PaymentMethodSectionProps {
  paymentMethod: InvoicePaymentMethod;
  setPaymentMethod: (method: InvoicePaymentMethod) => void;
  paymentReference: string;
  setPaymentReference: (ref: string) => void;
  paymentNotes: string;
  setPaymentNotes: (notes: string) => void;
  paymentDetails: PaymentDetails;
  setPaymentDetails: React.Dispatch<React.SetStateAction<PaymentDetails>>;
  totalAmount: number;
  cashBankAccounts?: CashBankAccount[];
  isQuotation?: boolean;
}

export const PaymentMethodSection: React.FC<PaymentMethodSectionProps> = ({
  paymentMethod,
  setPaymentMethod,
  paymentReference,
  setPaymentReference,
  paymentNotes,
  setPaymentNotes,
  paymentDetails,
  setPaymentDetails,
  totalAmount,
  cashBankAccounts = [],
  isQuotation = false,
}) => {
  const cashAccounts = cashBankAccounts.filter(a => a.type === 'cash');
  const bankAccounts = cashBankAccounts.filter(a => a.type === 'bank');

  const splitValidation = validatePaymentSplit(paymentMethod, totalAmount, paymentDetails);

  return (
    <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4.5 space-y-4">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-brand-blue" />
          <h4 className="text-xs font-bold text-slate-800">
            {isQuotation ? 'طريقة السداد المقترحة' : 'طريقة وتفاصيل السداد'}
          </h4>
        </div>
        <span className="text-[11px] text-slate-500 font-medium">
          {paymentMethod === 'credit' 
            ? 'آجل: يظل المبلغ مستحقاً في حساب العميل / المورد' 
            : 'دفع فوري / مخصص'}
        </span>
      </div>

      {/* Grid of Payment Methods */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {(Object.keys(PAYMENT_METHOD_LABELS) as InvoicePaymentMethod[]).map((method) => {
          const isSelected = paymentMethod === method;
          return (
            <button
              key={method}
              type="button"
              onClick={() => setPaymentMethod(method)}
              className={`p-2.5 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center ${
                isSelected
                  ? 'bg-brand-blue text-white border-brand-blue shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-100/50'
              }`}
            >
              <span className="text-[11px] leading-tight">{PAYMENT_METHOD_LABELS[method]}</span>
            </button>
          );
        })}
      </div>

      {/* Dynamic Fields based on Payment Method */}
      {paymentMethod !== 'credit' && (
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 space-y-3">
          
          {/* Single Method Account Selection */}
          {(paymentMethod === 'cash' || paymentMethod === 'card' || paymentMethod === 'bank_transfer' || paymentMethod === 'cheque') && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Cash Account selection */}
              {paymentMethod === 'cash' && (
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                    <Wallet className="w-3.5 h-3.5 text-slate-400" />
                    <span>الصندوق / الخزينة المحددة</span>
                  </label>
                  <select
                    value={paymentDetails.cash_account_id || ''}
                    onChange={(e) => setPaymentDetails(prev => ({ ...prev, cash_account_id: e.target.value }))}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-brand-blue"
                  >
                    <option value="">-- اختر الخزينة / الصندوق --</option>
                    {cashAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name || acc.account_name_ar} ({acc.account_number || 'نقدي'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Bank Account selection */}
              {(paymentMethod === 'card' || paymentMethod === 'bank_transfer' || paymentMethod === 'cheque') && (
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                    <Landmark className="w-3.5 h-3.5 text-slate-400" />
                    <span>الحساب البنكي المحدد</span>
                  </label>
                  <select
                    value={paymentDetails.bank_account_id || ''}
                    onChange={(e) => setPaymentDetails(prev => ({ ...prev, bank_account_id: e.target.value }))}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-brand-blue"
                  >
                    <option value="">-- اختر الحساب البنكي --</option>
                    {bankAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name || acc.account_name_ar} ({acc.bank_name || 'بنكي'}) - {acc.account_number || ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Reference number */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">رقم المرجع / العملية</label>
                <input
                  type="text"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="مثال: REF-98724 / رقم الحوالة"
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-brand-blue"
                />
              </div>
            </div>
          )}

          {/* Cheque Specific Fields */}
          {paymentMethod === 'cheque' && (
            <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500">رقم الشيك *</label>
                <input
                  type="text"
                  value={paymentDetails.cheque_number || ''}
                  onChange={(e) => setPaymentDetails(prev => ({ ...prev, cheque_number: e.target.value }))}
                  placeholder="مثال: CHK-1002"
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500">اسم البنك المسحوب عليه</label>
                <input
                  type="text"
                  value={paymentDetails.cheque_bank_name || ''}
                  onChange={(e) => setPaymentDetails(prev => ({ ...prev, cheque_bank_name: e.target.value }))}
                  placeholder="مصرف الراجحي / البنك الأهلي"
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500">تاريخ الشيك</label>
                <input
                  type="date"
                  value={paymentDetails.cheque_date || new Date().toISOString().split('T')[0]}
                  onChange={(e) => setPaymentDetails(prev => ({ ...prev, cheque_date: e.target.value }))}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500">حالة الشيك</label>
                <select
                  value={paymentDetails.cheque_status || 'received'}
                  onChange={(e) => setPaymentDetails(prev => ({ ...prev, cheque_status: e.target.value as any }))}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                >
                  {Object.entries(CHEQUE_STATUS_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Split Payment: Cash + Card */}
          {paymentMethod === 'cash_and_card' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">المبلغ النقدي (ر.س) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentDetails.cash_amount ?? ''}
                    onChange={(e) => setPaymentDetails(prev => ({ ...prev, cash_amount: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 text-left font-sans"
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">مبلغ الشبكة / البطاقة (ر.س) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentDetails.card_amount ?? ''}
                    onChange={(e) => setPaymentDetails(prev => ({ ...prev, card_amount: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 text-left font-sans"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {!splitValidation.isValid && (
                <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{splitValidation.errorMsg}</span>
                  <span className="ms-auto font-mono dir-ltr text-[11px]">
                    (المطلوب: {totalAmount.toFixed(2)} | الحالي: {((paymentDetails.cash_amount || 0) + (paymentDetails.card_amount || 0)).toFixed(2)})
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Split Payment: Bank Transfer + Cash */}
          {paymentMethod === 'bank_transfer_and_cash' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">مبلغ الحوالة البنكية (ر.س) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentDetails.bank_transfer_amount ?? ''}
                    onChange={(e) => setPaymentDetails(prev => ({ ...prev, bank_transfer_amount: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 text-left font-sans"
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">المبلغ النقدي (ر.س) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentDetails.cash_amount ?? ''}
                    onChange={(e) => setPaymentDetails(prev => ({ ...prev, cash_amount: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 text-left font-sans"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {!splitValidation.isValid && (
                <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{splitValidation.errorMsg}</span>
                  <span className="ms-auto font-mono dir-ltr text-[11px]">
                    (المطلوب: {totalAmount.toFixed(2)} | الحالي: {((paymentDetails.bank_transfer_amount || 0) + (paymentDetails.cash_amount || 0)).toFixed(2)})
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Additional Notes */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400">ملاحظات السداد</label>
            <input
              type="text"
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              placeholder="أي ملاحظات تتعلق بالسداد أو البنك"
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700"
            />
          </div>

        </div>
      )}
    </div>
  );
};
