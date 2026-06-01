-- TrafiCam — Migration : Pub locale partenaires
-- Executer dans Supabase SQL Editor

CREATE TABLE IF NOT EXISTS publicites (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  partenaire  TEXT    NOT NULL,
  image_url   TEXT    NOT NULL,
  lien        TEXT,
  description TEXT,
  ecrans      TEXT[]  DEFAULT '{"home","alertes","incidents"}',
  actif       BOOLEAN DEFAULT true,
  priorite    INT     DEFAULT 1,
  clics       INT     DEFAULT 0,
  impressions INT     DEFAULT 0,
  date_debut  DATE,
  date_fin    DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pub_actif ON publicites(actif, priorite DESC);
