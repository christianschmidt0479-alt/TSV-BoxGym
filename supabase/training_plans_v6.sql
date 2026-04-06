-- training_plans_v6.sql
-- Vorlagenqualität: template_quality für geprüfte Vereinsvorlagen.
-- Bestehende Vorlagen ohne dieses Feld erhalten automatisch NULL (= keine Bewertung).

ALTER TABLE public.training_plans
  ADD COLUMN IF NOT EXISTS template_quality text NULL;

-- Erlaubte Werte: 'tested' | 'recommended' | 'standard'
-- NULL bedeutet: keine Qualitätsbewertung (entspricht bisherigem Verhalten)
