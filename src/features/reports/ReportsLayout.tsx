import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { IncomeStatementPage } from './IncomeStatementPage';
import { BalanceSheetPage } from './BalanceSheetPage';
import { CustomerStatementPage } from './CustomerStatementPage';
import { VendorStatementPage } from './VendorStatementPage';
import { InventoryReportPage } from './InventoryReportPage';
import { TaxReportPage } from './TaxReportPage';
import { TrialBalancePage } from './TrialBalancePage';
import { LedgerReportPage } from './LedgerReportPage';
import { 
  TrendingUp, 
  Building, 
  Users, 
  Truck, 
  Package, 
  BarChart4, 
  Sparkles,
  Lock,
  Percent,
  FolderTree,
  ArrowRightLeft
} from 'lucide-react';

type ReportTab = 
  | 'income_statement' 
  | 'balance_sheet' 
  | 'customer_statement' 
  | 'vendor_statement' 
  | 'inventory_report' 
  | 'vat_tax_report'
  | 'trial_balance'
  | 'ledger_report';

export const ReportsLayout: React.FC = () => {
  const { currentOrg, roleInCurrentOrg } = useAuth();
  const [activeTab, setActiveTab] = useState<ReportTab>('income_statement');

  // Sales Role has limited access. Let's see if sales has NO access to financial reports.
  // "سند دور الصلاحية: (sales) في نظامك الحالي يجب حجب التقارير المالية عنه بالكامل...، باستمرار مرونة النظام."
  // Note: If sales user, we should only allow 'inventory_report' and disable others, 
  // or show a clean security lock statement or force activeTab to 'inventory_report'.
  const isSales = roleInCurrentOrg === 'sales';

  useEffect(() => {
    if (isSales) {
      setActiveTab('inventory_report');
    }
  }, [isSales]);

  return (
    <div className="space-y-6 text-right font-sans" dir="rtl">
      
      {/* Top Header section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold text-slate-900">التقارير المحاسبية والمالية والشركاء</h2>
            <span className="bg-emerald-500/15 text-emerald-600 text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 select-none">
              <Sparkles className="w-3 h-3 text-emerald-500 animate-pulse" />
              <span>التقارير الفورية نشطة</span>
            </span>
          </div>
          <p className="text-xs text-slate-500">
            استعرض الموقف المالي الشامل لمنشأتك، كشوفات العملاء والموردين التفصيلية التراكمية، ومطابقات الأرصدة المخزنية الفورية.
          </p>
        </div>
      </div>

      {/* Tabs list selector */}
      <div className="flex border-b border-slate-200 p-px gap-2 overflow-x-auto pb-0">
        
        {/* Income Statement TAB */}
        <button
          onClick={() => !isSales && setActiveTab('income_statement')}
          disabled={isSales}
          className={`py-3 px-4 text-xs font-extrabold border-b-2 flex items-center gap-2 transition whitespace-nowrap outline-none relative ${
            isSales ? 'opacity-40 cursor-not-allowed text-slate-400' : 'cursor-pointer'
          } ${
            activeTab === 'income_statement'
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <TrendingUp className="w-4 h-4 shrink-0" />
          <span>قائمة الدخل (Income Statement)</span>
          {isSales && <Lock className="w-3 h-3 text-slate-400 absolute left-1 top-2" />}
        </button>

        {/* Balance Sheet TAB */}
        <button
          onClick={() => !isSales && setActiveTab('balance_sheet')}
          disabled={isSales}
          className={`py-3 px-4 text-xs font-extrabold border-b-2 flex items-center gap-2 transition whitespace-nowrap outline-none relative ${
            isSales ? 'opacity-40 cursor-not-allowed text-slate-400' : 'cursor-pointer'
          } ${
            activeTab === 'balance_sheet'
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Building className="w-4 h-4 shrink-0" />
          <span>المركز المالي للشركة (Balance Sheet)</span>
          {isSales && <Lock className="w-3 h-3 text-slate-400 absolute left-1 top-2" />}
        </button>

        {/* Customer Statement TAB */}
        <button
          onClick={() => !isSales && setActiveTab('customer_statement')}
          disabled={isSales}
          className={`py-3 px-4 text-xs font-extrabold border-b-2 flex items-center gap-2 transition whitespace-nowrap outline-none relative ${
            isSales ? 'opacity-40 cursor-not-allowed text-slate-400' : 'cursor-pointer'
          } ${
            activeTab === 'customer_statement'
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users className="w-4 h-4 shrink-0" />
          <span>كشف حساب عميل (Customer Statement)</span>
          {isSales && <Lock className="w-3 h-3 text-slate-400 absolute left-1 top-2" />}
        </button>

        {/* Vendor Statement TAB */}
        <button
          onClick={() => !isSales && setActiveTab('vendor_statement')}
          disabled={isSales}
          className={`py-3 px-4 text-xs font-extrabold border-b-2 flex items-center gap-2 transition whitespace-nowrap outline-none relative ${
            isSales ? 'opacity-40 cursor-not-allowed text-slate-400' : 'cursor-pointer'
          } ${
            activeTab === 'vendor_statement'
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-slate-400 hover:text-slate-750'
          }`}
        >
          <Truck className="w-4 h-4 shrink-0" />
          <span>كشف حساب مورد (Vendor Statement)</span>
          {isSales && <Lock className="w-3 h-3 text-slate-400 absolute left-1 top-2" />}
        </button>

        {/* Inventory Valuation Statement TAB */}
        <button
          onClick={() => setActiveTab('inventory_report')}
          className={`py-3 px-4 text-xs font-extrabold border-b-2 flex items-center gap-2 transition whitespace-nowrap outline-none cursor-pointer ${
            activeTab === 'inventory_report'
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Package className="w-4 h-4 shrink-0" />
          <span>تقييم وحساب المخزون (Inventory Report)</span>
        </button>

        {/* VAT Tax Report TAB */}
        <button
          onClick={() => !isSales && setActiveTab('vat_tax_report')}
          disabled={isSales}
          className={`py-3 px-4 text-xs font-extrabold border-b-2 flex items-center gap-2 transition whitespace-nowrap outline-none relative ${
            isSales ? 'opacity-40 cursor-not-allowed text-slate-400' : 'cursor-pointer'
          } ${
            activeTab === 'vat_tax_report'
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Percent className="w-4 h-4 shrink-0" />
          <span>التقرير الضريبي (VAT Report)</span>
          {isSales && <Lock className="w-3 h-3 text-slate-400 absolute left-1 top-2" />}
        </button>

        {/* Trial Balance TAB */}
        <button
          onClick={() => !isSales && setActiveTab('trial_balance')}
          disabled={isSales}
          className={`py-3 px-4 text-xs font-extrabold border-b-2 flex items-center gap-2 transition whitespace-nowrap outline-none relative ${
            isSales ? 'opacity-40 cursor-not-allowed text-slate-400' : 'cursor-pointer'
          } ${
            activeTab === 'trial_balance'
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
          id="tab-trial-balance"
        >
          <FolderTree className="w-4 h-4 shrink-0" />
          <span>ميزان المراجعة (Trial Balance)</span>
          {isSales && <Lock className="w-3 h-3 text-slate-400 absolute left-1 top-2" />}
        </button>

        {/* General Ledger TAB */}
        <button
          onClick={() => !isSales && setActiveTab('ledger_report')}
          disabled={isSales}
          className={`py-3 px-4 text-xs font-extrabold border-b-2 flex items-center gap-2 transition whitespace-nowrap outline-none relative ${
            isSales ? 'opacity-40 cursor-not-allowed text-slate-400' : 'cursor-pointer'
          } ${
            activeTab === 'ledger_report'
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
          id="tab-ledger"
        >
          <ArrowRightLeft className="w-4 h-4 shrink-0" />
          <span>دفتر الأستاذ (General Ledger)</span>
          {isSales && <Lock className="w-3 h-3 text-slate-400 absolute left-1 top-2" />}
        </button>

      </div>

      {/* Dynamic Tabs contents renderer */}
      <div className="min-h-[450px]">
        {activeTab === 'income_statement' && !isSales ? (
          <IncomeStatementPage />
        ) : activeTab === 'balance_sheet' && !isSales ? (
          <BalanceSheetPage />
        ) : activeTab === 'customer_statement' && !isSales ? (
          <CustomerStatementPage />
        ) : activeTab === 'vendor_statement' && !isSales ? (
          <VendorStatementPage />
        ) : activeTab === 'vat_tax_report' && !isSales ? (
          <TaxReportPage />
        ) : activeTab === 'trial_balance' && !isSales ? (
          <TrialBalancePage />
        ) : activeTab === 'ledger_report' && !isSales ? (
          <LedgerReportPage />
        ) : (
          <InventoryReportPage />
        )}
      </div>

    </div>
  );
};
