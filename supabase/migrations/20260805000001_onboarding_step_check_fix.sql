-- Migration: Fix onboarding_step_check constraint to allow steps 1 through 4
BEGIN;

ALTER TABLE public.organizations
DROP CONSTRAINT IF EXISTS onboarding_step_check;

ALTER TABLE public.organizations
ADD CONSTRAINT onboarding_step_check
CHECK (onboarding_step BETWEEN 1 AND 4);

NOTIFY pgrst, 'reload schema';

COMMIT;
