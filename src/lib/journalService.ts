import { supabase } from './supabase';
import { JournalEntry, JournalEntryLine, Account } from '../types';
import { reportsService } from './reportsService';

export const journalService = {
  // ==========================================
  // JOURNAL ENTRIES
  // ==========================================
  async getJournalEntries(
    orgId: string,
    filters?: {
      status?: 'all' | 'draft' | 'posted' | 'reversed';
      fiscalYearId?: string;
      fiscalPeriodId?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    }
  ): Promise<JournalEntry[]> {
    let query = supabase
      .from('journal_entries')
      .select('*, fiscal_years(name), fiscal_periods:fiscal_periods!journal_entries_period_fk(name)')
      .eq('organization_id', orgId);

    if (filters) {
      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters.fiscalYearId) {
        query = query.eq('fiscal_year_id', filters.fiscalYearId);
      }
      if (filters.fiscalPeriodId) {
        query = query.eq('fiscal_period_id', filters.fiscalPeriodId);
      }
      if (filters.startDate) {
        query = query.gte('entry_date', filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte('entry_date', filters.endDate);
      }
      if (filters.search) {
        query = query.or(
          `entry_number.ilike.%${filters.search}%,reference.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
        );
      }
    }

    // Default sorting by newest date and number
    query = query.order('entry_date', { ascending: false }).order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    
    // Typecast to match JournalEntry interface
    return (data || []).map((item: any) => ({
      ...item,
      fiscal_year_name: item.fiscal_years?.name || '',
      fiscal_period_name: item.fiscal_periods?.name || ''
    })) as JournalEntry[];
  },

  async getJournalEntry(orgId: string, entryId: string): Promise<JournalEntry> {
    const { data: entry, error: entryError } = await supabase
      .from('journal_entries')
      .select('*, fiscal_years(name), fiscal_periods:fiscal_periods!journal_entries_period_fk(name)')
      .eq('id', entryId)
      .eq('organization_id', orgId)
      .single();

    if (entryError) throw entryError;

    const { data: lines, error: linesError } = await supabase
      .from('journal_entry_lines')
      .select('*, accounts:accounts!journal_entry_lines_account_org_fk(*)')
      .eq('journal_entry_id', entryId)
      .eq('organization_id', orgId)
      .order('line_number', { ascending: true });

    if (linesError) throw linesError;

    return {
      ...entry,
      fiscal_year_name: entry.fiscal_years?.name || '',
      fiscal_period_name: entry.fiscal_periods?.name || '',
      lines: (lines || []).map((line: any) => ({
        ...line,
        account: line.accounts
      }))
    } as JournalEntry;
  },

  async createJournalEntry(
    orgId: string,
    entry: {
      entry_date: string;
      reference?: string;
      description?: string;
      lines: Array<{
        account_id: string;
        description?: string;
        debit: number;
        credit: number;
      }>;
    }
  ): Promise<string> {
    const { data, error } = await supabase.rpc('create_journal_entry', {
      p_org_id: orgId,
      p_entry_date: entry.entry_date,
      p_reference: entry.reference || null,
      p_description: entry.description || null,
      p_lines: entry.lines
    });

    if (error) throw error;
    return data as string;
  },

  async updateJournalEntry(
    orgId: string,
    entryId: string,
    entry: {
      entry_date: string;
      reference?: string;
      description?: string;
      lines: Array<{
        account_id: string;
        description?: string;
        debit: number;
        credit: number;
      }>;
    }
  ): Promise<void> {
    const { error } = await supabase.rpc('update_journal_entry', {
      p_org_id: orgId,
      p_entry_id: entryId,
      p_entry_date: entry.entry_date,
      p_reference: entry.reference || null,
      p_description: entry.description || null,
      p_lines: entry.lines
    });

    if (error) throw error;
  },

  async postJournalEntry(orgId: string, entryId: string): Promise<void> {
    const { error } = await supabase.rpc('post_journal_entry', {
      p_org_id: orgId,
      p_entry_id: entryId
    });

    if (error) throw error;
  },

  async reverseJournalEntry(orgId: string, entryId: string): Promise<string> {
    const { data, error } = await supabase.rpc('reverse_journal_entry', {
      p_org_id: orgId,
      p_entry_id: entryId
    });

    if (error) throw error;
    return data as string;
  },

  async deleteDraftJournalEntry(orgId: string, entryId: string): Promise<void> {
    const { error } = await supabase.rpc('delete_draft_journal_entry', {
      p_org_id: orgId,
      p_entry_id: entryId
    });

    if (error) throw error;
  },


  // ==========================================
  // REPORTS (FORWARDED TO UNIFIED REPORTS SERVICE)
  // ==========================================
  async getLedgerReport(
    orgId: string,
    accountId: string,
    filters: {
      fiscalYearId: string;
      startDate: string;
      endDate: string;
    }
  ) {
    if (!filters.fiscalYearId || !filters.startDate || !filters.endDate) {
      throw new Error('السنة المالية وتاريخ البداية والنهاية عناصر إجبارية لاستخراج التقرير.');
    }
    const report = await reportsService.getLedgerReportAdvanced(
      orgId,
      accountId,
      filters.startDate,
      filters.endDate,
      false,
      filters.fiscalYearId
    );
    return {
      account: report.account,
      records: report.entries.map(e => ({
        entry_id: e.entry_id,
        entry_number: e.entry_number || e.reference,
        entry_date: e.entry_date,
        entry_description: e.description,
        line_description: e.description,
        debit: e.debit,
        credit: e.credit,
        running_balance: e.running_balance,
        source_type: e.source_type,
        source_id: e.source_id,
        reference: e.reference
      }))
    };
  },

  async getTrialBalance(
    orgId: string,
    filters: {
      fiscalYearId: string;
      startDate: string;
      endDate: string;
    }
  ) {
    if (!filters.fiscalYearId || !filters.startDate || !filters.endDate) {
      throw new Error('السنة المالية وتاريخ البداية والنهاية عناصر إجبارية لاستخراج التقرير.');
    }
    const report = await reportsService.getTrialBalanceAdvanced(
      orgId,
      filters.startDate,
      filters.endDate,
      true,
      true,
      true,
      filters.fiscalYearId
    );

    return report.accounts.map(acc => ({
      id: acc.account_id,
      code: acc.code,
      name_ar: acc.name_ar,
      name_en: acc.name_en,
      classification: acc.classification,
      nature: acc.nature,
      allow_direct_posting: acc.allow_direct_posting,
      debit: acc.period_debit,
      credit: acc.period_credit,
      net_balance: acc.net_balance
    }));
  },

  async resolveJournalEntrySource(orgId: string, entryId: string): Promise<{
    type: 'sales_invoice' | 'receipt' | 'purchase_bill' | 'payment' | 'journal_entry';
    id: string;
    label: string;
    printPath: string;
  }> {
    if (!entryId) {
      return {
        type: 'journal_entry',
        id: '',
        label: 'قيد محاسبي',
        printPath: '#/print/journal-entry/'
      };
    }

    try {
      // 1. Check sales_invoices
      const { data: invoice } = await supabase
        .from('sales_invoices')
        .select('id, invoice_number')
        .eq('organization_id', orgId)
        .eq('journal_entry_id', entryId)
        .maybeSingle();

      if (invoice) {
        return {
          type: 'sales_invoice',
          id: invoice.id,
          label: `فاتورة مبيعات رقم ${invoice.invoice_number || invoice.id}`,
          printPath: `#/print/sales-invoice/${invoice.id}`
        };
      }

      // 2. Check receipts
      const { data: receipt } = await supabase
        .from('receipts')
        .select('id, receipt_number')
        .eq('organization_id', orgId)
        .eq('journal_entry_id', entryId)
        .maybeSingle();

      if (receipt) {
        return {
          type: 'receipt',
          id: receipt.id,
          label: `سند قبض رقم ${receipt.receipt_number || receipt.id}`,
          printPath: `#/print/receipt/${receipt.id}`
        };
      }

      // 3. Check purchase_bills
      const { data: bill } = await supabase
        .from('purchase_bills')
        .select('id, bill_number')
        .eq('organization_id', orgId)
        .eq('journal_entry_id', entryId)
        .maybeSingle();

      if (bill) {
        return {
          type: 'purchase_bill',
          id: bill.id,
          label: `فاتورة مشتريات رقم ${bill.bill_number || bill.id}`,
          printPath: `#/print/purchase-bill/${bill.id}`
        };
      }

      // 4. Check payments
      const { data: payment } = await supabase
        .from('payments')
        .select('id, payment_number')
        .eq('organization_id', orgId)
        .eq('journal_entry_id', entryId)
        .maybeSingle();

      if (payment) {
        return {
          type: 'payment',
          id: payment.id,
          label: `سند صرف رقم ${payment.payment_number || payment.id}`,
          printPath: `#/print/payment/${payment.id}`
        };
      }
    } catch (err) {
      console.error('Error resolving journal entry source:', err);
    }

    // Fallback if not found in any
    return {
      type: 'journal_entry',
      id: entryId,
      label: 'قيد محاسبي',
      printPath: `#/print/journal-entry/${entryId}`
    };
  }
};
