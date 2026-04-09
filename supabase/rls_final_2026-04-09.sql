-- Migration: Absicherung der letzten offenen Tabellen (Security Advisor: "RLS Disabled in Public")
-- Datum: 2026-04-09

-- training_ai_context
ALTER TABLE public.training_ai_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.training_ai_context FROM anon;
REVOKE ALL ON public.training_ai_context FROM authenticated;

-- training_trainer_profiles
ALTER TABLE public.training_trainer_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.training_trainer_profiles FROM anon;
REVOKE ALL ON public.training_trainer_profiles FROM authenticated;

-- member_update_tokens (sensibel)
ALTER TABLE public.member_update_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_update_tokens FROM anon;
REVOKE ALL ON public.member_update_tokens FROM authenticated;

-- training_plans
ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.training_plans FROM anon;
REVOKE ALL ON public.training_plans FROM authenticated;
