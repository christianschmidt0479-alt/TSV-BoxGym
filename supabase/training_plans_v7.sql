-- training_plans_v7.sql
-- Trainer-Zuweisung und Trainer-Ergänzungen für Trainingspläne.
-- Ermöglicht, einen konkreten Trainer einem Plan zuzuordnen (Pilot: Thomas).
-- Trainer können eigene Notizen / leicht angepasste Pläne speichern,
-- ohne den Admin-Originalplan zu überschreiben.

-- Zugewiesener Trainer (UUID aus trainer_accounts.id)
ALTER TABLE public.training_plans
  ADD COLUMN IF NOT EXISTS assigned_trainer_id uuid NULL;

-- Kurze Ergänzungen / Hinweise des Trainers (Freitext, max ~2000 Zeichen)
ALTER TABLE public.training_plans
  ADD COLUMN IF NOT EXISTS trainer_notes text NULL;

-- Optionaler JSON-String: Trainer-angepasste Version des generierten Plans
-- Format identisch zu generated_plan (GeneratedTrainingPlan-Schema).
-- NULL = keine Traineranpassung; Admin-Original bleibt unberührt.
ALTER TABLE public.training_plans
  ADD COLUMN IF NOT EXISTS trainer_modified_plan text NULL;

-- Index für schnelle Abfrage aller einem Trainer zugewiesenen Pläne
CREATE INDEX IF NOT EXISTS training_plans_assigned_trainer_idx
  ON public.training_plans (assigned_trainer_id)
  WHERE assigned_trainer_id IS NOT NULL;
