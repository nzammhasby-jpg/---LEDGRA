import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reportsService } from './reportsService';
import { supabase } from './supabase';
import { getErrorMessage } from './errors';

vi.mock('./supabase', () => ({
  supabase: {
    rpc: vi.fn()
  }
}));

describe('Financial Reports RPC Contract & Error Handling Tests', () => {
  const mockOrgId = '00000000-0000-0000-0000-000000000001';
  const mockFiscalYearId = '00000000-0000-0000-0000-000000000002';
  const mockAccountId = '00000000-0000-0000-0000-000000000003';
  const mockCustomerId = '00000000-0000-0000-0000-000000000004';
  const mockVendorId = '00000000-0000-0000-0000-000000000005';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. RPC Parameter Signatures Alignment (Contract Verification)', () => {
    it('get_advanced_balance_sheet passes p_org_id, p_as_of_date, and p_comparison_date', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({ data: { main_period: {}, accounts: [] }, error: null } as any);

      await reportsService.getAdvancedBalanceSheet(mockOrgId, '2026-12-31', '2025-12-31');

      expect(mockRpc).toHaveBeenCalledTimes(1);
      const [rpcName, payload] = mockRpc.mock.calls[0];

      expect(rpcName).toBe('get_advanced_balance_sheet');
      expect(payload).toEqual({
        p_org_id: mockOrgId,
        p_as_of_date: '2026-12-31',
        p_comparison_date: '2025-12-31'
      });
    });

    it('get_advanced_balance_sheet supports null comparison date', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({ data: { main_period: {}, accounts: [] }, error: null } as any);

      await reportsService.getAdvancedBalanceSheet(mockOrgId, '2026-12-31', null);

      expect(mockRpc).toHaveBeenCalledTimes(1);
      const [rpcName, payload] = mockRpc.mock.calls[0];

      expect(rpcName).toBe('get_advanced_balance_sheet');
      expect(payload).toEqual({
        p_org_id: mockOrgId,
        p_as_of_date: '2026-12-31',
        p_comparison_date: null
      });
    });

    it('get_income_statement_advanced passes p_org_id, p_date_from, p_date_to, and p_exclude_closing_entries', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({ data: { total_revenue: 0 }, error: null } as any);

      await reportsService.getIncomeStatementAdvanced(mockOrgId, '2026-01-01', '2026-12-31', true);

      expect(mockRpc).toHaveBeenCalledTimes(1);
      const [rpcName, payload] = mockRpc.mock.calls[0];

      expect(rpcName).toBe('get_income_statement_advanced');
      expect(payload).toEqual({
        p_org_id: mockOrgId,
        p_date_from: '2026-01-01',
        p_date_to: '2026-12-31',
        p_exclude_closing_entries: true
      });
    });

    it('get_trial_balance_advanced passes all 7 required parameters with exact naming', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({ data: { accounts: [], total_opening_debit: 0 }, error: null } as any);

      await reportsService.getTrialBalanceAdvanced(
        mockOrgId,
        '2026-01-01',
        '2026-12-31',
        false,
        true,
        true,
        mockFiscalYearId
      );

      expect(mockRpc).toHaveBeenCalledTimes(1);
      const [rpcName, payload] = mockRpc.mock.calls[0];

      expect(rpcName).toBe('get_trial_balance_advanced');
      expect(payload).toEqual({
        p_org_id: mockOrgId,
        p_date_from: '2026-01-01',
        p_date_to: '2026-12-31',
        p_include_zero_accounts: false,
        p_include_parent_accounts: true,
        p_exclude_closing_entries: true,
        p_fiscal_year_id: mockFiscalYearId
      });
    });

    it('get_ledger_report_advanced passes all 6 required parameters with exact naming', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({ data: { entries: [], opening_balance: 0 }, error: null } as any);

      await reportsService.getLedgerReportAdvanced(
        mockOrgId,
        mockAccountId,
        '2026-01-01',
        '2026-12-31',
        true,
        mockFiscalYearId
      );

      expect(mockRpc).toHaveBeenCalledTimes(1);
      const [rpcName, payload] = mockRpc.mock.calls[0];

      expect(rpcName).toBe('get_ledger_report_advanced');
      expect(payload).toEqual({
        p_org_id: mockOrgId,
        p_account_id: mockAccountId,
        p_date_from: '2026-01-01',
        p_date_to: '2026-12-31',
        p_exclude_closing_entries: true,
        p_fiscal_year_id: mockFiscalYearId
      });
    });

    it('get_tax_report passes p_org_id, p_date_from, and p_date_to', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({ data: { total_output_tax: 0, total_input_tax: 0 }, error: null } as any);

      await reportsService.getTaxReport(mockOrgId, '2026-01-01', '2026-03-31');

      expect(mockRpc).toHaveBeenCalledTimes(1);
      const [rpcName, payload] = mockRpc.mock.calls[0];

      expect(rpcName).toBe('get_tax_report');
      expect(payload).toEqual({
        p_org_id: mockOrgId,
        p_date_from: '2026-01-01',
        p_date_to: '2026-03-31'
      });
    });

    it('get_customer_statement passes p_org_id, p_customer_id, p_date_from, and p_date_to', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({ data: { movements: [] }, error: null } as any);

      await reportsService.getCustomerStatement(mockOrgId, mockCustomerId, '2026-01-01', '2026-12-31');

      expect(mockRpc).toHaveBeenCalledTimes(1);
      const [rpcName, payload] = mockRpc.mock.calls[0];

      expect(rpcName).toBe('get_customer_statement');
      expect(payload).toEqual({
        p_org_id: mockOrgId,
        p_customer_id: mockCustomerId,
        p_date_from: '2026-01-01',
        p_date_to: '2026-12-31'
      });
    });

    it('get_vendor_statement passes p_org_id, p_vendor_id, p_date_from, and p_date_to', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({ data: { movements: [] }, error: null } as any);

      await reportsService.getVendorStatement(mockOrgId, mockVendorId, '2026-01-01', '2026-12-31');

      expect(mockRpc).toHaveBeenCalledTimes(1);
      const [rpcName, payload] = mockRpc.mock.calls[0];

      expect(rpcName).toBe('get_vendor_statement');
      expect(payload).toEqual({
        p_org_id: mockOrgId,
        p_vendor_id: mockVendorId,
        p_date_from: '2026-01-01',
        p_date_to: '2026-12-31'
      });
    });

    it('get_customer_aging_report passes p_organization_id and p_as_of_date', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({ data: [], error: null } as any);

      await reportsService.getCustomerAgingReport(mockOrgId, '2026-12-31');

      expect(mockRpc).toHaveBeenCalledTimes(1);
      const [rpcName, payload] = mockRpc.mock.calls[0];

      expect(rpcName).toBe('get_customer_aging_report');
      expect(payload).toEqual({
        p_organization_id: mockOrgId,
        p_as_of_date: '2026-12-31'
      });
    });

    it('get_vendor_aging_report passes p_organization_id and p_as_of_date', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({ data: [], error: null } as any);

      await reportsService.getVendorAgingReport(mockOrgId, '2026-12-31');

      expect(mockRpc).toHaveBeenCalledTimes(1);
      const [rpcName, payload] = mockRpc.mock.calls[0];

      expect(rpcName).toBe('get_vendor_aging_report');
      expect(payload).toEqual({
        p_organization_id: mockOrgId,
        p_as_of_date: '2026-12-31'
      });
    });

    it('get_inventory_report passes p_org_id', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({ data: [], error: null } as any);

      await reportsService.getInventoryReport(mockOrgId);

      expect(mockRpc).toHaveBeenCalledTimes(1);
      const [rpcName, payload] = mockRpc.mock.calls[0];

      expect(rpcName).toBe('get_inventory_report');
      expect(payload).toEqual({
        p_org_id: mockOrgId
      });
    });
  });

  describe('2. Error Translation & Security Handling', () => {
    it('translates schema cache missing function errors to user-friendly Arabic guidance', () => {
      const schemaCacheError = new Error(
        'Could not find the function public.get_advanced_balance_sheet(p_as_of_date, p_comparison_date, p_org_id) in the schema cache'
      );
      const translated = getErrorMessage(schemaCacheError);

      expect(translated).toContain('خدمة هذا التقرير أو الإجراء غير متاحة حالياً في قاعدة البيانات');
      expect(translated).toContain('Schema Cache');
      expect(translated).not.toContain('p_as_of_date, p_comparison_date');
    });

    it('translates PGRST202 function missing errors correctly', () => {
      const pgrstError = {
        code: 'PGRST202',
        message: 'Could not find the function public.get_tax_report in the schema cache'
      };
      const translated = getErrorMessage(pgrstError);

      expect(translated).toContain('خدمة هذا التقرير أو الإجراء غير متاحة حالياً في قاعدة البيانات');
    });

    it('translates 42501 unauthorized permission errors cleanly without exposing internals', () => {
      const permError = {
        code: '42501',
        message: 'permission denied for function get_income_statement_advanced'
      };
      const translated = getErrorMessage(permError);

      expect(translated).toContain('ليس لديك صلاحية كافية');
      expect(translated).toContain('المالك أو المدير أو المحاسب أو المستعرض');
      expect(translated).not.toContain('42501');
    });

    it('translates PL/pgSQL Arabic RAISE EXCEPTION messages directly to the user', () => {
      const raiseError = new Error('غير مصرح: هذه التقارير المالية متاحة للمالك والمدير والمحاسب والمستعرض فقط.');
      const translated = getErrorMessage(raiseError);

      expect(translated).toContain('ليس لديك صلاحية كافية');
    });

    it('translates network disconnection errors safely', () => {
      const netError = new TypeError('Failed to fetch');
      const translated = getErrorMessage(netError);

      expect(translated).toContain('تعذر الاتصال بالخادم الرئيسي (فشل الاتصال الشبكي)');
    });
  });
});
