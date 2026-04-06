-- Neue Felder für Vorlagen-Funktion und Status "reviewed"
ALTER TABLE public.training_plans
  ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS template_name text NULL;

CREATE INDEX IF NOT EXISTS training_plans_template_idx
  ON public.training_plans (is_template)
  WHERE is_template = true;
