import { TrialBalanceAccount, TrialBalanceTotals, LedgerReportResult, LedgerEntryRow } from './reportsService';
import { escapeCSVValue, CSVCell } from './exportUtils';

export type CSVRow = CSVCell[];

export interface BalanceSideDecomposition {
  debit: number;
  credit: number;
  side: 'debit' | 'credit' | 'zero';
}

/**
 * Decomposes a signed net balance into debit and credit components, plus side identifier.
 * - balance > 0 => debit = balance, credit = 0, side = 'debit'
 * - balance < 0 => debit = 0, credit = abs(balance), side = 'credit'
 * - abs(balance) <= 0.01 => debit = 0, credit = 0, side = 'zero'
 */
export function decomposeBalanceSide(balance: number): BalanceSideDecomposition {
  const rounded = Math.round(balance * 100) / 100;
  if (Math.abs(rounded) <= 0.01) {
    return { debit: 0, credit: 0, side: 'zero' };
  }
  if (rounded > 0) {
    return { debit: rounded, credit: 0, side: 'debit' };
  }
  return { debit: 0, credit: Math.abs(rounded), side: 'credit' };
}

/**
 * Calculates a signed balance according to the unified equation:
 * signed_balance = opening_balance + debit - credit
 */
export function calculateSignedBalance(openingBalance: number, debit: number, credit: number): number {
  return openingBalance + debit - credit;
}

/**
 * Calculates Trial Balance totals based strictly on leaf/posting accounts to prevent double-counting parent accounts.
 */
export function calculateTrialBalanceTotals(accounts: TrialBalanceAccount[]): TrialBalanceTotals {
  const leafAccounts = accounts.filter(a =>
    a.allow_direct_posting || !accounts.some(child => child.parent_id === a.account_id)
  );

  let opDebit = 0;
  let opCredit = 0;
  let pdDebit = 0;
  let pdCredit = 0;
  let clDebit = 0;
  let clCredit = 0;

  for (const acc of leafAccounts) {
    opDebit += Number(acc.opening_debit || 0);
    opCredit += Number(acc.opening_credit || 0);
    pdDebit += Number(acc.period_debit || 0);
    pdCredit += Number(acc.period_credit || 0);
    clDebit += Number(acc.closing_debit || 0);
    clCredit += Number(acc.closing_credit || 0);
  }

  const periodDiff = Math.abs(pdDebit - pdCredit);
  const closingDiff = Math.abs(clDebit - clCredit);
  const isPeriodBalanced = periodDiff < 0.01;
  const isClosingBalanced = closingDiff < 0.01;
  const isBalanced = isPeriodBalanced && isClosingBalanced;

  return {
    opening_debit: Math.round(opDebit * 100) / 100,
    opening_credit: Math.round(opCredit * 100) / 100,
    period_debit: Math.round(pdDebit * 100) / 100,
    period_credit: Math.round(pdCredit * 100) / 100,
    closing_debit: Math.round(clDebit * 100) / 100,
    closing_credit: Math.round(clCredit * 100) / 100,
    period_difference: Math.round(periodDiff * 100) / 100,
    closing_difference: Math.round(closingDiff * 100) / 100,
    is_period_balanced: isPeriodBalanced,
    is_closing_balanced: isClosingBalanced,
    is_balanced: isBalanced,
    difference: Math.round(closingDiff * 100) / 100,
  };
}

/**
 * Builds URL search parameters string for General Ledger report navigation.
 * Guarantees all 4 mandatory parameters: accountId, fiscalYearId, dateFrom, dateTo.
 */
export function buildLedgerReportSearchParams(params: {
  accountId: string;
  fiscalYearId: string;
  dateFrom: string;
  dateTo: string;
}): string {
  if (!params.accountId || !params.fiscalYearId || !params.dateFrom || !params.dateTo) {
    throw new Error('جميع معاملات التقرير (accountId, fiscalYearId, dateFrom, dateTo) إجبارية.');
  }
  const sp = new URLSearchParams();
  sp.set('tab', 'ledger_report');
  sp.set('accountId', params.accountId);
  sp.set('fiscalYearId', params.fiscalYearId);
  sp.set('dateFrom', params.dateFrom);
  sp.set('dateTo', params.dateTo);
  return sp.toString();
}

/**
 * Parses and validates search parameters for General Ledger report navigation.
 */
export function parseLedgerReportSearchParams(searchParams: URLSearchParams): {
  accountId: string | null;
  fiscalYearId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  isValid: boolean;
} {
  const accountId = searchParams.get('accountId') || searchParams.get('account_id') || null;
  const fiscalYearId = searchParams.get('fiscalYearId') || searchParams.get('fiscal_year_id') || null;
  const dateFrom = searchParams.get('dateFrom') || searchParams.get('date_from') || searchParams.get('startDate') || null;
  const dateTo = searchParams.get('dateTo') || searchParams.get('date_to') || searchParams.get('endDate') || null;

  const isValid = Boolean(accountId && fiscalYearId && dateFrom && dateTo);

  return {
    accountId,
    fiscalYearId,
    dateFrom,
    dateTo,
    isValid,
  };
}

/**
 * Reconciles General Ledger closing balance with Trial Balance account closing balance.
 */
export function reconcileLedgerAndTrialBalance(
  ledgerResult: LedgerReportResult,
  tbAccount: TrialBalanceAccount
): { isReconciled: boolean; difference: number } {
  const ledgerClosingNet = ledgerResult.closing_balance;
  const tbClosingNet = tbAccount.closing_debit - tbAccount.closing_credit;
  const diff = Math.abs(ledgerClosingNet - tbClosingNet);
  return {
    isReconciled: diff < 0.01,
    difference: Math.round(diff * 100) / 100,
  };
}

/**
 * Reconciles customer or vendor statement balance with General Ledger account balance.
 */
export function reconcileCustomerVendorWithLedger(
  statementBalance: number,
  ledgerClosingBalance: number
): { isReconciled: boolean; difference: number } {
  const diff = Math.abs(statementBalance - ledgerClosingBalance);
  return {
    isReconciled: diff < 0.01,
    difference: Math.round(diff * 100) / 100,
  };
}

/**
 * Generates a safe CSV row with formula injection escaping.
 */
export function generateSafeCSVRow(cells: CSVCell[]): string {
  return cells.map(escapeCSVValue).join(',');
}
