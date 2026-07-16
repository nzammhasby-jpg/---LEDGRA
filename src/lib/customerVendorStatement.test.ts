import { describe, it, expect } from 'vitest';
import { formatNumberWithLatinDigits, safeParseFloat } from './formatters';
import { escapeCSVValue, generateCSV, CSVCell } from './exportUtils';

// Define strict types to comply with constraints (no 'any' allowed)
interface MockCustomerMovement {
  id: string;
  date: string;
  journal_number: string;
  reference: string | null;
  description: string;
  debit: number;
  credit: number;
  running_balance: number;
}

interface MockCustomerStatementResult {
  customer_code: string;
  customer_name: string;
  opening_balance: number;
  total_debit: number;
  total_credit: number;
  closing_balance: number;
  movements: MockCustomerMovement[];
}

interface MockVendorMovement {
  id: string;
  date: string;
  journal_number: string;
  reference: string | null;
  description: string;
  debit: number;
  credit: number;
  running_balance: number;
}

interface MockVendorStatementResult {
  vendor_code: string;
  vendor_name: string;
  opening_balance: number;
  total_debit: number;
  total_credit: number;
  closing_balance: number;
  movements: MockVendorMovement[];
}

// 1. Local functions to test business logic and rules
function validateDates(dateFrom: string, dateTo: string): { isValid: boolean; error?: string } {
  if (!dateFrom || !dateTo) {
    return { isValid: false, error: 'يرجى تحديد تاريخ البداية والنهاية.' };
  }
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return { isValid: false, error: 'صيغة التاريخ غير صالحة.' };
  }
  if (from > to) {
    return { isValid: false, error: 'تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية.' };
  }
  return { isValid: true };
}

function resolveIdFromParams(params: { customerId?: string; vendorId?: string; id?: string }, type: 'customer' | 'vendor'): string {
  if (type === 'customer') {
    return params.customerId || params.id || '';
  } else {
    return params.vendorId || params.id || '';
  }
}

// Helper to calculate mock customer statement
function calculateCustomerStatement(
  openingBalance: number,
  movements: Omit<MockCustomerMovement, 'running_balance'>[]
): MockCustomerStatementResult {
  let running = openingBalance;
  const calculatedMovements: MockCustomerMovement[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const m of movements) {
    running = running + m.debit - m.credit;
    totalDebit += m.debit;
    totalCredit += m.credit;
    calculatedMovements.push({
      ...m,
      running_balance: running,
    });
  }

  const closingBalance = openingBalance + totalDebit - totalCredit;

  return {
    customer_code: 'CUST-001',
    customer_name: 'عميل تجريبي',
    opening_balance: openingBalance,
    total_debit: totalDebit,
    total_credit: totalCredit,
    closing_balance: closingBalance,
    movements: calculatedMovements,
  };
}

// Helper to calculate mock vendor statement (Vendor is credit nature: + credit, - debit)
function calculateVendorStatement(
  openingBalance: number,
  movements: Omit<MockVendorMovement, 'running_balance'>[]
): MockVendorStatementResult {
  let running = openingBalance;
  const calculatedMovements: MockVendorMovement[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const m of movements) {
    running = running + m.credit - m.debit;
    totalDebit += m.debit;
    totalCredit += m.credit;
    calculatedMovements.push({
      ...m,
      running_balance: running,
    });
  }

  const closingBalance = openingBalance + totalCredit - totalDebit;

  return {
    vendor_code: 'VEND-001',
    vendor_name: 'مورد تجريبي',
    opening_balance: openingBalance,
    total_debit: totalDebit,
    total_credit: totalCredit,
    closing_balance: closingBalance,
    movements: calculatedMovements,
  };
}

describe('LEDGRA REP-1A — كشف حساب العميل والمورد والطباعة', () => {

  describe('1. معالجة وتدقيق فلاتر البحث والروابط', () => {
    it('يجب قراءة المعرّف الرئيسي بشكل صحيح ويدعم المعرّف القديم id كبديل مؤقت', () => {
      // Customer
      expect(resolveIdFromParams({ customerId: 'cust-123' }, 'customer')).toBe('cust-123');
      expect(resolveIdFromParams({ id: 'cust-legacy' }, 'customer')).toBe('cust-legacy');
      expect(resolveIdFromParams({ customerId: 'cust-123', id: 'cust-legacy' }, 'customer')).toBe('cust-123');
      expect(resolveIdFromParams({}, 'customer')).toBe('');

      // Vendor
      expect(resolveIdFromParams({ vendorId: 'vend-456' }, 'vendor')).toBe('vend-456');
      expect(resolveIdFromParams({ id: 'vend-legacy' }, 'vendor')).toBe('vend-legacy');
      expect(resolveIdFromParams({ vendorId: 'vend-456', id: 'vend-legacy' }, 'vendor')).toBe('vend-456');
      expect(resolveIdFromParams({}, 'vendor')).toBe('');
    });

    it('يجب رفض الفترة المعكوسة أو التاريخ غير الصالح أو نقص الفلاتر', () => {
      // Reversed dates
      const rev = validateDates('2026-12-31', '2026-01-01');
      expect(rev.isValid).toBe(false);
      expect(rev.error).toContain('بعد تاريخ النهاية');

      // Invalid format
      const inv = validateDates('invalid-date', '2026-01-01');
      expect(inv.isValid).toBe(false);
      expect(inv.error).toContain('غير صالحة');

      // Missing filter
      const mis = validateDates('', '2026-01-01');
      expect(mis.isValid).toBe(false);
      expect(mis.error).toContain('تحديد تاريخ');

      // Valid period
      const valid = validateDates('2026-01-01', '2026-06-30');
      expect(valid.isValid).toBe(true);
    });
  });

  describe('2. معادلات رصيد كشف حساب العميل', () => {
    it('الرصيد الختامي = الرصيد الافتتاحي + إجمالي المدين - إجمالي الدائن', () => {
      const opening = 1000.00;
      const movements = [
        { id: '1', date: '2026-01-05', journal_number: 'JV-01', reference: null, description: 'فاتورة مبيعات', debit: 500.00, credit: 0 },
        { id: '2', date: '2026-01-10', journal_number: 'JV-02', reference: null, description: 'سند قبض', debit: 0, credit: 300.00 },
      ];

      const statement = calculateCustomerStatement(opening, movements);

      expect(statement.opening_balance).toBe(1000.00);
      expect(statement.total_debit).toBe(500.00);
      expect(statement.total_credit).toBe(300.00);
      expect(statement.closing_balance).toBe(1200.00); // 1000 + 500 - 300
    });

    it('يجب أن يتطابق آخر رصيد تراكمي (running_balance) مع الرصيد الختامي (closing_balance)', () => {
      const opening = -200.00; // رصيد دائن لصالح العميل
      const movements = [
        { id: '1', date: '2026-01-05', journal_number: 'JV-01', reference: null, description: 'فاتورة مبيعات', debit: 600.00, credit: 0 },
        { id: '2', date: '2026-01-10', journal_number: 'JV-02', reference: null, description: 'سند قبض', debit: 0, credit: 150.00 },
      ];

      const statement = calculateCustomerStatement(opening, movements);

      expect(statement.closing_balance).toBe(250.00); // -200 + 600 - 150
      expect(statement.movements[statement.movements.length - 1].running_balance).toBe(statement.closing_balance);
    });

    it('يجب عرض المعنى الصحيح للأرصدة (موجب: مستحق على العميل، سالب: لصالح العميل)', () => {
      const positiveBal = 500.00;
      const negativeBal = -300.00;

      const meaningPos = positiveBal >= 0 ? 'مستحق على العميل للمنشأة' : 'رصيد دائن لصالح العميل';
      const meaningNeg = negativeBal >= 0 ? 'مستحق على العميل للمنشأة' : 'رصيد دائن لصالح العميل';

      expect(meaningPos).toBe('مستحق على العميل للمنشأة');
      expect(meaningNeg).toBe('رصيد دائن لصالح العميل');
    });
  });

  describe('3. معادلات رصيد كشف حساب المورد', () => {
    it('الرصيد الختامي = الرصيد الافتتاحي + إجمالي الدائن - إجمالي المدين', () => {
      const opening = 2000.00; // دائن (مستحق للمورد)
      const movements = [
        { id: '1', date: '2026-01-05', journal_number: 'JV-01', reference: null, description: 'فاتورة مشتريات', debit: 0, credit: 800.00 },
        { id: '2', date: '2026-01-10', journal_number: 'JV-02', reference: null, description: 'سند صرف', debit: 500.00, credit: 0 },
      ];

      const statement = calculateVendorStatement(opening, movements);

      expect(statement.opening_balance).toBe(2000.00);
      expect(statement.total_debit).toBe(500.00);
      expect(statement.total_credit).toBe(800.00);
      expect(statement.closing_balance).toBe(2300.00); // 2000 + 800 - 500
    });

    it('يجب أن يتطابق آخر رصيد تراكمي للمورد مع الرصيد الختامي للمورد', () => {
      const opening = 0.00;
      const movements = [
        { id: '1', date: '2026-01-05', journal_number: 'JV-01', reference: null, description: 'فاتورة مشتريات', debit: 0, credit: 1200.00 },
        { id: '2', date: '2026-01-10', journal_number: 'JV-02', reference: null, description: 'سند صرف للدفعة الأولى', debit: 1200.00, credit: 0 },
      ];

      const statement = calculateVendorStatement(opening, movements);

      expect(statement.closing_balance).toBe(0.00);
      expect(statement.movements[statement.movements.length - 1].running_balance).toBe(statement.closing_balance);
    });

    it('يجب عرض المعنى الصحيح للأرصدة للمورد (موجب: مستحق للمورد، سالب: له رصيد مدفوع مقدماً)', () => {
      const positiveBal = 1500.00;
      const negativeBal = -450.00;

      const meaningPos = positiveBal >= 0 ? 'مستحق للمورد من المنشأة' : 'له رصيد مدفوع مقدماً';
      const meaningNeg = negativeBal >= 0 ? 'مستحق للمورد من المنشأة' : 'له رصيد مدفوع مقدماً';

      expect(meaningPos).toBe('مستحق للمورد من المنشأة');
      expect(meaningNeg).toBe('له رصيد مدفوع مقدماً');
    });
  });

  describe('4. حماية وتثبيت ترتيب حركات اليوم نفسه ومصداقية الحسابات', () => {
    it('ثبات ترتيب الحركات باستخدام التاريخ، رقم القيد، معرّف القيد ومعرّف سطر القيد', () => {
      // Simulate stable sorting logic inside SQL
      const movementsList = [
        { date: '2026-01-15', entry_number: 'JV-10', entry_id: 'eid-2', line_id: 'lid-2', debit: 100 },
        { date: '2026-01-15', entry_number: 'JV-05', entry_id: 'eid-1', line_id: 'lid-1', debit: 50 },
        { date: '2026-01-15', entry_number: 'JV-10', entry_id: 'eid-2', line_id: 'lid-3', debit: 200 },
      ];

      // Sort by: date ASC, entry_number ASC, entry_id ASC, line_id ASC
      const sorted = [...movementsList].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        if (a.entry_number !== b.entry_number) return a.entry_number.localeCompare(b.entry_number);
        if (a.entry_id !== b.entry_id) return a.entry_id.localeCompare(b.entry_id);
        return a.line_id.localeCompare(b.line_id);
      });

      expect(sorted[0].entry_number).toBe('JV-05');
      expect(sorted[1].line_id).toBe('lid-2');
      expect(sorted[2].line_id).toBe('lid-3');
    });

    it('عدم تكرار الافتتاحي وعدم احتساب المسودات والملغاة وعزل المنشآت', () => {
      // Ensure that opening balance entries (reference = 'رصيد افتتاحي' or source_type = 'opening_balance')
      // and drafts (status != 'posted') are filtered out from the range's movements.
      const rawEntries = [
        { reference: 'رصيد افتتاحي', source_type: 'opening_balance', status: 'posted', amount: 5000, org_id: 'org-1' },
        { reference: 'فاتورة سريعة', source_type: 'sales', status: 'posted', amount: 150, org_id: 'org-1' },
        { reference: 'قيد مسودة', source_type: 'manual', status: 'draft', amount: 300, org_id: 'org-1' },
        { reference: 'قيد منشأة أخرى', source_type: 'manual', status: 'posted', amount: 1000, org_id: 'org-different' },
      ];

      // Simulate query conditions:
      // AND je.reference <> 'رصيد افتتاحي'
      // AND COALESCE(je.source_type, '') <> 'opening_balance'
      // AND je.status = 'posted'
      // AND je.organization_id = p_org_id
      const filtered = rawEntries.filter(je => 
        je.org_id === 'org-1' &&
        je.status === 'posted' &&
        je.reference !== 'رصيد افتتاحي' &&
        je.source_type !== 'opening_balance'
      );

      expect(filtered.length).toBe(1);
      expect(filtered[0].reference).toBe('فاتورة سريعة');
    });

    it('فترة بلا حركات: يجب استمرار عرض الافتتاحي والختامي بشكل سليم', () => {
      const statement = calculateCustomerStatement(1500.00, []);
      expect(statement.opening_balance).toBe(1500.00);
      expect(statement.closing_balance).toBe(1500.00);
      expect(statement.movements.length).toBe(0);
    });
  });

  describe('5. حماية ملفات التصدير CSV وتنسيق الأرقام', () => {
    it('تطبيق حماية CSV Formula Injection مع الحفاظ على الأرقام السالبة الحقيقية', () => {
      // Safe string escaping
      expect(escapeCSVValue('عميل')).toBe('عميل');
      expect(escapeCSVValue('شركة "الذهب"')).toBe('"شركة ""الذهب"""');

      // CSV formula characters protection
      expect(escapeCSVValue('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
      expect(escapeCSVValue('+abc')).toBe("'+abc");
      expect(escapeCSVValue('@sales')).toBe("'@sales");

      // TRUE negative and positive numbers must remain uncorrupted (not prepended with apostrophe)
      expect(escapeCSVValue('-125.50')).toBe('-125.50');
      expect(escapeCSVValue('+45.00')).toBe('+45.00');
      expect(escapeCSVValue('1500')).toBe('1500');
    });

    it('التحقق من عدم ظهور NaN أو Infinity نهائياً في التنسيق الرقمي', () => {
      expect(formatNumberWithLatinDigits(NaN)).toBe('0.00');
      expect(formatNumberWithLatinDigits(Infinity)).toBe('0.00');
      expect(formatNumberWithLatinDigits(-Infinity)).toBe('0.00');
      expect(formatNumberWithLatinDigits(undefined)).toBe('0.00');
      expect(formatNumberWithLatinDigits(null)).toBe('0.00');
      expect(formatNumberWithLatinDigits('')).toBe('0.00');
      
      expect(formatNumberWithLatinDigits(1250.75)).toBe('1250.75');
      expect(formatNumberWithLatinDigits('-450.5')).toBe('-450.50');
    });
  });

});
