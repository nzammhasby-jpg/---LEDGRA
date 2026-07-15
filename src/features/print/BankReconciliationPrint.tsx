import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { bankReconciliationService } from '../../lib/bankReconciliationService';
import { BankReconciliation, BankReconciliationLine } from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { formatArabicDateWithLatinDigits } from '../../lib/formatters';
import { PrintActions } from './PrintActions';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { PrintWatermark } from './PrintWatermark';
import { AlertCircle, Loader2 } from 'lucide-react';

export const BankReconciliationPrint: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { currentOrg } = useAuth();

  const [reconciliation, setReconciliation] = useState<BankReconciliation | null>(null);
  const [lines, setLines] = useState<BankReconciliationLine[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrg?.id && id) {
      loadReconciliationData();
    }
  }, [currentOrg?.id, id]);

  const loadReconciliationData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [recData, linesData, adjustmentsData] = await Promise.all([
        bankReconciliationService.getBankReconciliation(id!),
        bankReconciliationService.listBankReconciliationLines(id!),
        bankReconciliationService.listBankReconciliationAdjustments(id!)
      ]);

      if (recData.organization_id !== currentOrg!.id) {
        throw new Error('غير مصرح لك بالوصول إلى هذه المنشأة أو المستند المالي');
      }

      setReconciliation(recData);
      setLines(linesData);
      setAdjustments(adjustmentsData);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number | undefined | null) => {
    if (num === undefined || num === null) return '0.00';
    return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getAdjustmentTypeLabel = (type: string) => {
    switch (type) {
      case 'bank_fee': return 'رسوم بنكية';
      case 'bank_interest': return 'عوائد بنكية';
      case 'transfer_charge': return 'عمولة تحويل';
      case 'rounding_difference': return 'فروقات تقريب';
      case 'other': return 'تسويات أخرى';
      default: return type;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" dir="rtl">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-brand-blue animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-bold">جاري تحميل تقرير مطابقة الحساب للطباعة...</p>
        </div>
      </div>
    );
  }

  if (error || !reconciliation) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-3xl p-6 text-center space-y-4 shadow-xl">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">تعذر تحميل مستند مطابقة الحساب</h3>
            <p className="text-xs text-slate-400 mt-1">{error || 'المستند غير موجود أو تم حذفه'}</p>
          </div>
          <button
            onClick={() => window.history.back()}
            className="w-full py-2.25 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            رجوع للخلف
          </button>
        </div>
      </div>
    );
  }

  const getStatusWatermarkText = (status: string) => {
    if (status === 'draft') return 'مسودة جارية';
    if (status === 'cancelled') return 'ملغى وعكسي';
    return '';
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return 'مسودة (قيد المطابقة)';
      case 'completed': return 'مكتملة ومرحلة';
      case 'cancelled': return 'ملغاة';
      default: return status;
    }
  };

  // Group matched lines
  const matchedLines = lines.filter(l => l.is_matched);
  const unmatchedLines = lines.filter(l => !l.is_matched);

  return (
    <div className="bg-slate-100 min-h-screen animate-fadeIn font-sans" dir="rtl">
      <PrintActions customBackPath="/banking/reconciliations" />

      {/* Main A4 Printable Sheet Content Chassis */}
      <div className="relative bg-white w-full max-w-[210mm] min-h-[297mm] mx-auto p-12 my-8 border border-slate-200 shadow-2xl rounded-xl print-page print:border-none print:shadow-none print:my-0 print:p-0 print:rounded-none overflow-hidden text-right">
        
        {/* Status Watermark */}
        {reconciliation.status && (
          <PrintWatermark status={reconciliation.status} />
        )}

        {/* Corporate Standard Header */}
        <PrintHeader
          currentOrg={currentOrg}
          documentTitle="تقرير مطابقة الحساب المالي والكشف الفعلي"
          documentDate={reconciliation.reconciliation_date}
          documentNumber={reconciliation.id.substring(0, 8).toUpperCase()}
          extraMeta={[
            { label: 'نوع الحساب', value: reconciliation.account_type === 'bank' ? 'بنكي' : 'صندوق كاش' },
            { label: 'العملة', value: reconciliation.currency_code || currentOrg?.currency_code || '' }
          ]}
        />

        {/* Financial Summary & Information Block Grid */}
        <div className="mb-6">
          <h4 className="text-xs font-black text-slate-900 border-r-4 border-brand-navy pr-2.5 mb-3">بيانات مطابقة الحساب والموازنة</h4>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="bg-slate-50 p-4 rounded-xl space-y-2 border border-slate-100">
              <div className="flex justify-between">
                <span className="text-slate-500">اسم الحساب المالي:</span>
                <span className="font-bold text-slate-800">{reconciliation.account_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">تاريخ الجرد والمطابقة:</span>
                <span className="font-mono font-bold text-slate-800">{reconciliation.reconciliation_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">حالة المطابقة:</span>
                <span className="font-bold text-slate-800">{getStatusLabel(reconciliation.status)}</span>
              </div>
              {reconciliation.notes && (
                <div className="flex flex-col pt-1.5 border-t border-slate-200 text-[11px]">
                  <span className="text-slate-500">ملاحظات وتسويات الجلسة:</span>
                  <span className="text-slate-700 italic mt-0.5">{reconciliation.notes}</span>
                </div>
              )}
            </div>

            <div className="bg-slate-50 p-4 rounded-xl space-y-2 border border-slate-100">
              <div className="flex justify-between">
                <span className="text-slate-500">الرصيد الدفتري الحالي:</span>
                <span className="font-mono font-bold text-slate-800">{formatNumber(reconciliation.book_balance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الرصيد الفعلي (كشف الحساب):</span>
                <span className="font-mono font-bold text-slate-800">{formatNumber(reconciliation.statement_balance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الرصيد الدفتري المطابق:</span>
                <span className="font-mono font-bold text-slate-800">
                  {formatNumber(Number(reconciliation.statement_balance) + Number(reconciliation.difference))}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold">
                <span className="text-slate-600">الفرق المعلق غير المطابق:</span>
                <span className={`font-mono ${Number(reconciliation.difference) === 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {reconciliation.status === 'completed' ? '0.00' : formatNumber(reconciliation.difference)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 1. Matched Ledger Entries Table */}
        <div className="mb-6">
          <h4 className="text-xs font-black text-slate-900 border-r-4 border-green-600 pr-2.5 mb-3">
            الحركات المطابقة والمسواة ({matchedLines.length})
          </h4>
          {matchedLines.length === 0 ? (
            <div className="text-center p-6 bg-slate-50 rounded-xl text-xs text-slate-400 border border-slate-100">
              لا توجد حركات تم مطابقتها في هذه الجلسة.
            </div>
          ) : (
            <table className="w-full text-right text-[11px] border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="p-2.5">تاريخ الحركة</th>
                  <th className="p-2.5">النوع</th>
                  <th className="p-2.5">الوصف والتفاصيل</th>
                  <th className="p-2.5 text-left">وارد / مدين</th>
                  <th className="p-2.5 text-left">صادر / دائن</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {matchedLines.map((line) => (
                  <tr key={line.id}>
                    <td className="p-2.5 font-mono">{line.transaction_date}</td>
                    <td className="p-2.5">
                      {line.source_type === 'receipt' ? 'سند قبض' :
                       line.source_type === 'payment' ? 'سند صرف' :
                       line.source_type === 'transfer' ? 'تحويل بنكي' : 'قيد يدوي'}
                    </td>
                    <td className="p-2.5">{line.description}</td>
                    <td className="p-2.5 text-left font-mono text-green-600">
                      {Number(line.debit_amount) > 0 ? formatNumber(line.debit_amount) : '—'}
                    </td>
                    <td className="p-2.5 text-left font-mono text-amber-600">
                      {Number(line.credit_amount) > 0 ? formatNumber(line.credit_amount) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 2. Unmatched Ledger Entries Table */}
        {unmatchedLines.length > 0 && (
          <div className="mb-8">
            <h4 className="text-xs font-black text-slate-900 border-r-4 border-amber-500 pr-2.5 mb-3">
              الحركات المتبقية المعلقة (غير المطابقة) ({unmatchedLines.length})
            </h4>
            <table className="w-full text-right text-[11px] border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="p-2.5">تاريخ الحركة</th>
                  <th className="p-2.5">النوع</th>
                  <th className="p-2.5">الوصف والتفاصيل</th>
                  <th className="p-2.5 text-left">وارد / مدين</th>
                  <th className="p-2.5 text-left">صادر / دائن</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {unmatchedLines.map((line) => (
                  <tr key={line.id} className="opacity-80">
                    <td className="p-2.5 font-mono">{line.transaction_date}</td>
                    <td className="p-2.5">
                      {line.source_type === 'receipt' ? 'سند قبض' :
                       line.source_type === 'payment' ? 'سند صرف' :
                       line.source_type === 'transfer' ? 'تحويل بنكي' : 'قيد يدوي'}
                    </td>
                    <td className="p-2.5">{line.description}</td>
                    <td className="p-2.5 text-left font-mono">
                      {Number(line.debit_amount) > 0 ? formatNumber(line.debit_amount) : '—'}
                    </td>
                    <td className="p-2.5 text-left font-mono">
                      {Number(line.credit_amount) > 0 ? formatNumber(line.credit_amount) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 3. Bank Reconciliation Adjustments (فروقات وتسويات بنكية) */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-3 border-r-4 border-indigo-600 pr-2.5">
            <h4 className="text-xs font-black text-slate-900">
              فروقات وتسويات بنكية ({adjustments.length})
            </h4>
            {reconciliation.adjustment_journal_entry_id && (
              <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100 font-bold mr-auto font-mono">
                قيد تسوية الفروقات: {reconciliation.adjustment_journal_entry_id.substring(0, 8).toUpperCase()}
              </span>
            )}
          </div>

          {adjustments.length === 0 ? (
            <div className="text-center p-6 bg-slate-50 rounded-xl text-xs text-slate-400 border border-slate-100">
              لا توجد فروقات أو تسويات بنكية مسجلة على هذه المطابقة.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-[11px] border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="p-2.5">نوع التسوية</th>
                    <th className="p-2.5">الوصف</th>
                    <th className="p-2.5">الحساب المحاسبي</th>
                    <th className="p-2.5 text-left">مدين</th>
                    <th className="p-2.5 text-left">دائن</th>
                    <th className="p-2.5 text-left">المبلغ ({reconciliation.currency_code || currentOrg?.currency_code || ''})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {adjustments.map((adj) => (
                    <tr key={adj.id}>
                      <td className="p-2.5">{getAdjustmentTypeLabel(adj.adjustment_type)}</td>
                      <td className="p-2.5">{adj.description}</td>
                      <td className="p-2.5">
                        {adj.account_code ? `[${adj.account_code}] ` : ''}
                        {adj.account_name_ar || adj.account_name_en || ''}
                      </td>
                      <td className="p-2.5 text-left font-mono text-rose-600">
                        {Number(adj.debit_amount) > 0 ? formatNumber(adj.debit_amount) : '—'}
                      </td>
                      <td className="p-2.5 text-left font-mono text-emerald-600">
                        {Number(adj.credit_amount) > 0 ? formatNumber(adj.credit_amount) : '—'}
                      </td>
                      <td className="p-2.5 text-left font-mono font-bold text-slate-900">
                        {formatNumber(adj.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Creator / Approver Signatures */}
        <div className="mt-12 grid grid-cols-2 gap-8 text-xs select-none">
          <div className="space-y-6">
            <p className="font-bold text-slate-700">توقيع المحاسب / مُعِدّ المطابقة:</p>
            <div className="border-b border-dashed border-slate-300 w-48 h-8" />
            <p className="text-[10px] text-slate-400">
              الاسم: {reconciliation.created_by_name || '................................................'}
            </p>
          </div>
          <div className="space-y-6">
            <p className="font-bold text-slate-700">اعتماد الإدارة والمدقق المالي:</p>
            <div className="border-b border-dashed border-slate-300 w-48 h-8" />
            <p className="text-[10px] text-slate-400">
              {reconciliation.status === 'completed'
                ? `الاسم: ${reconciliation.completed_by_name || 'المدير المالي'}`
                : 'الاسم: ................................................'}
            </p>
          </div>
        </div>

        {/* Corporate Standard Footer */}
        <PrintFooter />

      </div>
    </div>
  );
};
