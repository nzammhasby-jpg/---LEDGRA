import React, { useState } from 'react';
import { ChartOfAccounts } from './ChartOfAccounts';
import { FiscalYears } from './FiscalYears';
import { AccountingSettings } from './AccountingSettings';
import { JournalEntries } from './JournalEntries';
import { LedgerReport } from './LedgerReport';
import { TrialBalance } from './TrialBalance';
import { useTranslation } from '../../i18n/translations';
import { FolderTree, Calendar, Sparkles, Settings, FileText, BookOpen, Activity } from 'lucide-react';

export const AccountingLayout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'chart' | 'fiscal' | 'settings' | 'journal' | 'ledger' | 'trial'>('journal');
  const { t } = useTranslation('ar');

  return (
    <div className="space-y-6 text-right font-sans" dir="rtl">
      
      {/* Top Banner section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold text-slate-900">قسم المحاسبة والدفاتر والشركاء</h2>
            <span className="bg-brand-blue/15 text-brand-blue text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 select-none">
              <Sparkles className="w-3 h-3" />
              <span>محرك القيود اليومية نشط</span>
            </span>
          </div>
          <p className="text-xs text-slate-500">
            أدر السنوات المالية، شجرة الحسابات والدليل الشجري، أو تصفح القيود اليومية والمزاني الاسترشادية المتوازنة.
          </p>
        </div>
      </div>

      {/* Embedded accounting sub-tabs selector list */}
      <div className="flex border-b border-slate-200 p-px gap-2 overflow-x-auto pb-0">
        <button
          onClick={() => setActiveTab('journal')}
          className={`py-3 px-4.5 text-xs font-extrabold border-b-2 flex items-center gap-2 transition cursor-pointer whitespace-nowrap outline-none ${
            activeTab === 'journal'
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileText className="w-4 h-4 shrink-0" />
          <span>القيود اليومية (Journal Entries)</span>
        </button>

        <button
          onClick={() => setActiveTab('chart')}
          className={`py-3 px-4.5 text-xs font-extrabold border-b-2 flex items-center gap-2 transition cursor-pointer whitespace-nowrap outline-none ${
            activeTab === 'chart'
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <FolderTree className="w-4 h-4 shrink-0" />
          <span>شجرة دليل الحسابات (Ledgers)</span>
        </button>

        <button
          onClick={() => setActiveTab('fiscal')}
          className={`py-3 px-4.5 text-xs font-extrabold border-b-2 flex items-center gap-2 transition cursor-pointer whitespace-nowrap outline-none ${
            activeTab === 'fiscal'
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Calendar className="w-4 h-4 shrink-0" />
          <span>السنوات والفترات المالية (Fiscal Cycles)</span>
        </button>

        <button
          onClick={() => setActiveTab('ledger')}
          className={`py-3 px-4.5 text-xs font-extrabold border-b-2 flex items-center gap-2 transition cursor-pointer whitespace-nowrap outline-none ${
            activeTab === 'ledger'
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <BookOpen className="w-4 h-4 shrink-0" />
          <span>دفتر الأستاذ العام (General Ledger)</span>
        </button>

        <button
          onClick={() => setActiveTab('trial')}
          className={`py-3 px-4.5 text-xs font-extrabold border-b-2 flex items-center gap-2 transition cursor-pointer whitespace-nowrap outline-none ${
            activeTab === 'trial'
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Activity className="w-4 h-4 shrink-0" />
          <span>ميزان المراجعة الأولي (Trial Balance)</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`py-3 px-4.5 text-xs font-extrabold border-b-2 flex items-center gap-2 transition cursor-pointer whitespace-nowrap outline-none ${
            activeTab === 'settings'
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span>الإعدادات المحاسبية الافتراضية (Accounting Settings)</span>
        </button>
      </div>

      {/* Dynamic Content Frame */}
      <div className="min-h-[400px]">
        {activeTab === 'journal' ? (
          <JournalEntries />
        ) : activeTab === 'chart' ? (
          <ChartOfAccounts />
        ) : activeTab === 'fiscal' ? (
          <FiscalYears />
        ) : activeTab === 'ledger' ? (
          <LedgerReport />
        ) : activeTab === 'trial' ? (
          <TrialBalance />
        ) : (
          <AccountingSettings />
        )}
      </div>

    </div>
  );
};

