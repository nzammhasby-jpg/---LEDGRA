import { supabase } from './supabase';
import { JournalEntry, JournalEntryLine, Account } from '../types';

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
      .select('*, fiscal_years(name), fiscal_periods(name)')
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
      .select('*, fiscal_years(name), fiscal_periods(name)')
      .eq('id', entryId)
      .eq('organization_id', orgId)
      .single();

    if (entryError) throw entryError;

    const { data: lines, error: linesError } = await supabase
      .from('journal_entry_lines')
      .select('*, accounts(*)')
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
  // REPORTS
  // ==========================================
  async getLedgerReport(
    orgId: string,
    accountId: string,
    filters: {
      fiscalYearId?: string;
      startDate?: string;
      endDate?: string;
    }
  ) {
    let query = supabase
      .from('journal_entry_lines')
      .select('debit, credit, description, created_at, journal_entries!inner(entry_number, entry_date, description, status, fiscal_year_id)')
      .eq('organization_id', orgId)
      .eq('account_id', accountId)
      .eq('journal_entries.status', 'posted');

    if (filters.fiscalYearId) {
      query = query.eq('journal_entries.fiscal_year_id', filters.fiscalYearId);
    }
    if (filters.startDate) {
      query = query.gte('journal_entries.entry_date', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('journal_entries.entry_date', filters.endDate);
    }

    const { data, error } = await query;
    if (error) throw error;

    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('nature, name_ar, name_en, code')
      .eq('id', accountId)
      .eq('organization_id', orgId)
      .single();

    if (accountError) throw accountError;

    // Filtered sorting by date/number safely
    const sortedData = (data || []).sort((a: any, b: any) => {
      const dateDiff = new Date(a.journal_entries.entry_date).getTime() - new Date(b.journal_entries.entry_date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.journal_entries.entry_number.localeCompare(b.journal_entries.entry_number, undefined, { numeric: true });
    });

    let runningBalance = 0;
    const records = sortedData.map((row: any) => {
      const db = Number(row.debit || 0);
      const cr = Number(row.credit || 0);

      if (account.nature === 'debit') {
        runningBalance += (db - cr);
      } else {
        runningBalance += (cr - db);
      }

      return {
        entry_number: row.journal_entries.entry_number,
        entry_date: row.journal_entries.entry_date,
        entry_description: row.journal_entries.description,
        line_description: row.description,
        debit: db,
        credit: cr,
        running_balance: runningBalance
      };
    });

    return {
      account,
      records
    };
  },

  async getTrialBalance(
    orgId: string,
    filters: {
      fiscalYearId?: string;
      startDate?: string;
      endDate?: string;
    }
  ) {
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('*')
      .eq('organization_id', orgId)
      .order('code', { ascending: true });

    if (accountsError) throw accountsError;

    let query = supabase
      .from('journal_entry_lines')
      .select('account_id, debit, credit, journal_entries!inner(status, entry_date, fiscal_year_id)')
      .eq('organization_id', orgId)
      .eq('journal_entries.status', 'posted');

    if (filters.fiscalYearId) {
      query = query.eq('journal_entries.fiscal_year_id', filters.fiscalYearId);
    }
    if (filters.startDate) {
      query = query.gte('journal_entries.entry_date', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('journal_entries.entry_date', filters.endDate);
    }

    const { data: lines, error: linesError } = await query;
    if (linesError) throw linesError;

    const leafBalances: Record<string, { debit: number; credit: number }> = {};
    for (const ln of lines || []) {
      const accId = ln.account_id;
      const db = Number(ln.debit || 0);
      const cr = Number(ln.credit || 0);
      if (!leafBalances[accId]) {
        leafBalances[accId] = { debit: 0, credit: 0 };
      }
      leafBalances[accId].debit += db;
      leafBalances[accId].credit += cr;
    }

    const getAccountTotals = (acc: any): { debit: number; credit: number } => {
      const children = (accounts || []).filter((a: any) => a.parent_id === acc.id);
      if (children.length === 0) {
        return leafBalances[acc.id] || { debit: 0, credit: 0 };
      }

      let totDb = 0;
      let totCr = 0;
      for (const child of children) {
        const sub = getAccountTotals(child);
        totDb += sub.debit;
        totCr += sub.credit;
      }
      return { debit: totDb, credit: totCr };
    };

    const trialBalanceRows = (accounts || []).map((acc: any) => {
      const totals = getAccountTotals(acc);
      const net = acc.nature === 'debit' ? (totals.debit - totals.credit) : (totals.credit - totals.debit);
      return {
        id: acc.id,
        code: acc.code,
        name_ar: acc.name_ar,
        name_en: acc.name_en,
        classification: acc.classification,
        nature: acc.nature,
        allow_direct_posting: acc.allow_direct_posting,
        debit: totals.debit,
        credit: totals.credit,
        net_balance: net
      };
    });

    return trialBalanceRows;
  }
};
