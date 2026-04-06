-- Migration: KI-Basisprofil für Trainingsplanung
-- Singleton-Tabelle: immer nur 1 Zeile (id = 1)

CREATE TABLE IF NOT EXISTS public.training_ai_context (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  -- Ausstattung
  has_ring              boolean        NOT NULL DEFAULT true,
  ring_often_available  boolean        NOT NULL DEFAULT true,
  heavy_bags_count      integer        NOT NULL DEFAULT 8,
  mitts_pairs_count     integer        NOT NULL DEFAULT 6,
  jump_ropes_count      integer        NOT NULL DEFAULT 12,
  medicine_balls_count  integer        NOT NULL DEFAULT 4,

  -- Kapazität & Raum
  max_group_size        integer        NOT NULL DEFAULT 20,
  space_description     text           NOT NULL DEFAULT '',

  -- Inhaltliche Leitlinien
  training_principles   text           NOT NULL DEFAULT '',
  group_characteristics text           NOT NULL DEFAULT '',

  updated_at            timestamptz    NOT NULL DEFAULT now()
);

-- Einen Initial-Datensatz einfügen sofern noch keiner existiert
INSERT INTO public.training_ai_context (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
