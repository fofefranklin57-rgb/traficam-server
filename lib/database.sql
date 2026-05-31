-- TrafiCam — Schéma Supabase complet v2
-- Coller dans l'éditeur SQL de Supabase → Run

CREATE EXTENSION IF NOT EXISTS postgis;

-- Table utilisateurs
CREATE TABLE IF NOT EXISTS utilisateurs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telephone VARCHAR(20) UNIQUE NOT NULL,
  nom VARCHAR(100),
  push_token TEXT,
  latitude DECIMAL(9,6),
  longitude DECIMAL(9,6),
  signalements INTEGER DEFAULT 0,
  confirmations INTEGER DEFAULT 0,
  points INTEGER DEFAULT 0,
  derniere_activite TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table incidents
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(20) NOT NULL CHECK (type IN ('accident', 'bouchon')),
  gravite VARCHAR(10) NOT NULL CHECK (gravite IN ('leger', 'moyen', 'grave')),
  lieu VARCHAR(200) NOT NULL,
  description TEXT,
  latitude DECIMAL(9,6) NOT NULL,
  longitude DECIMAL(9,6) NOT NULL,
  photo_url TEXT,
  statut VARCHAR(20) DEFAULT 'actif' CHECK (statut IN ('actif', 'resolu', 'invalide')),
  confirmations INTEGER DEFAULT 1,
  signale_par UUID REFERENCES utilisateurs(id),
  source VARCHAR(20) DEFAULT 'user' CHECK (source IN ('user', 'gps', 'auto')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table positions GPS
CREATE TABLE IF NOT EXISTS positions_gps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  utilisateur_id UUID REFERENCES utilisateurs(id),
  latitude DECIMAL(9,6) NOT NULL,
  longitude DECIMAL(9,6) NOT NULL,
  vitesse INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table OTP temporaire (remplace stockage mémoire Node.js)
CREATE TABLE IF NOT EXISTS otp_temp (
  telephone VARCHAR(20) PRIMARY KEY,
  code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nettoyage automatique OTP expirés (optionnel)
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_temp(expires_at);

-- Index performances
CREATE INDEX IF NOT EXISTS idx_incidents_statut ON incidents(statut);
CREATE INDEX IF NOT EXISTS idx_incidents_type ON incidents(type);
CREATE INDEX IF NOT EXISTS idx_positions_created ON positions_gps(created_at DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_incidents_updated_at
  BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ══════════════════════════════════════════════════
-- ACTIVER SUPABASE REALTIME sur la table incidents
-- (remplace le WebSocket custom Node.js)
-- ══════════════════════════════════════════════════
ALTER TABLE incidents REPLICA IDENTITY FULL;

-- Dans Supabase Dashboard → Database → Replication :
-- Active "incidents" dans la liste des tables suivies
