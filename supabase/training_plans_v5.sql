-- training_plans_v5.sql
-- Planmodus: Einzelplan / Kombiplan / Folgeplan
-- Migration ist rückwärtskompatibel: Bestehende Pläne erhalten automatisch 'single' / false / null.

ALTER TABLE public.training_plans
  ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS secondary_group_key text NULL,
  ADD COLUMN IF NOT EXISTS is_holiday_combined boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS based_on_plan_id uuid NULL REFERENCES public.training_plans(id) ON DELETE SET NULL;
