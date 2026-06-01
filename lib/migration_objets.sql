-- TrafiCam - Migration : Module Objets Trouves
-- Executer dans Supabase SQL Editor

-- ETAPE 1 : Creer le bucket de photos (via Dashboard Supabase)
-- Storage > New bucket > nom: "traficam-photos" > Public: ON

-- ETAPE 2 : Tables

CREATE TABLE IF NOT EXISTS objets_trouves (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type_objet          TEXT NOT NULL CHECK (type_objet IN (
                        'cni','passeport','permis','telephone',
                        'sac','cles','carte_bancaire','autre')),
  photo_url           TEXT,
  nom_sur_objet       TEXT,
  telephone_sur_objet TEXT,
  description         TEXT,
  lieu_trouve         TEXT,
  lat_trouve          DECIMAL(9,6),
  lng_trouve          DECIMAL(9,6),
  lieu_depot          TEXT NOT NULL,
  depot_lat           DECIMAL(9,6),
  depot_lng           DECIMAL(9,6),
  statut              TEXT DEFAULT 'disponible'
                      CHECK (statut IN ('disponible','notifie','recupere')),
  signale_par         UUID REFERENCES utilisateurs(id),
  notifie_user_id     UUID REFERENCES utilisateurs(id),
  recupere_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_objets_statut ON objets_trouves(statut);
CREATE INDEX IF NOT EXISTS idx_objets_type ON objets_trouves(type_objet);
CREATE INDEX IF NOT EXISTS idx_objets_nom ON objets_trouves(nom_sur_objet);
CREATE INDEX IF NOT EXISTS idx_objets_tel ON objets_trouves(telephone_sur_objet);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE objets_trouves;

-- ETAPE 3 : Policy Storage (dans Supabase > Storage > traficam-photos > Policies)
-- Allow public read: SELECT pour tout le monde
-- Allow authenticated upload: INSERT pour les utilisateurs connectes
