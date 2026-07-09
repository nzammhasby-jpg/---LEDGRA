BEGIN;

-- 1. Ensure columns exist on both tables
ALTER TABLE public.receipts
ADD COLUMN IF NOT EXISTS cash_bank_account_id uuid;

ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS cash_bank_account_id uuid;

-- 2. Clean up any orphan references to non-existent accounts
UPDATE public.receipts r
SET cash_bank_account_id = NULL
WHERE cash_bank_account_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.cash_bank_accounts cba
    WHERE cba.id = r.cash_bank_account_id
  );

UPDATE public.payments p
SET cash_bank_account_id = NULL
WHERE cash_bank_account_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.cash_bank_accounts cba
    WHERE cba.id = p.cash_bank_account_id
  );

-- 3. Safely drop any existing foreign key constraints from receipts to cash_bank_accounts
DO $$
DECLARE
  v_attnum smallint;
  v_con record;
BEGIN
  SELECT attnum INTO v_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.receipts'::regclass
    AND attname = 'cash_bank_account_id';

  IF v_attnum IS NOT NULL THEN
    FOR v_con IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'public.receipts'::regclass
        AND contype = 'f'
        AND confrelid = 'public.cash_bank_accounts'::regclass
        AND v_attnum = ANY(conkey)
    LOOP
      EXECUTE format('ALTER TABLE public.receipts DROP CONSTRAINT IF EXISTS %I', v_con.conname);
    END LOOP;
  END IF;
END $$;

-- 4. Safely drop any existing foreign key constraints from payments to cash_bank_accounts
DO $$
DECLARE
  v_attnum smallint;
  v_con record;
BEGIN
  SELECT attnum INTO v_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.payments'::regclass
    AND attname = 'cash_bank_account_id';

  IF v_attnum IS NOT NULL THEN
    FOR v_con IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'public.payments'::regclass
        AND contype = 'f'
        AND confrelid = 'public.cash_bank_accounts'::regclass
        AND v_attnum = ANY(conkey)
    LOOP
      EXECUTE format('ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS %I', v_con.conname);
    END LOOP;
  END IF;
END $$;

-- 5. Explicitly drop the target constraints if they exist under the desired names to avoid duplication
ALTER TABLE public.receipts DROP CONSTRAINT IF EXISTS receipts_cash_bank_account_id_fkey;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_cash_bank_account_id_fkey;

-- 6. Add Foreign Keys with clean, standardized names
ALTER TABLE public.receipts
ADD CONSTRAINT receipts_cash_bank_account_id_fkey
FOREIGN KEY (cash_bank_account_id)
REFERENCES public.cash_bank_accounts(id)
ON DELETE SET NULL;

ALTER TABLE public.payments
ADD CONSTRAINT payments_cash_bank_account_id_fkey
FOREIGN KEY (cash_bank_account_id)
REFERENCES public.cash_bank_accounts(id)
ON DELETE SET NULL;

-- 7. Ensure performance indexes exist
CREATE INDEX IF NOT EXISTS receipts_cash_bank_account_idx
ON public.receipts (organization_id, cash_bank_account_id);

CREATE INDEX IF NOT EXISTS payments_cash_bank_account_idx
ON public.payments (organization_id, cash_bank_account_id);

-- 8. Refresh PostgREST schema cache to make relationships visible
NOTIFY pgrst, 'reload schema';

COMMIT;
