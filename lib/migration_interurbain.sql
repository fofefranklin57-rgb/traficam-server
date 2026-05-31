-- TrafiCam - Migration : Module Voyages Interurbains
-- Executer dans Supabase SQL Editor

-- Agences de voyage
CREATE TABLE IF NOT EXISTS agences_voyage (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nom           TEXT NOT NULL,
  telephone     TEXT,
  ville_base    TEXT NOT NULL,
  gare_routiere TEXT,
  note_moyenne  DECIMAL(2,1) DEFAULT 0,
  nb_avis       INT DEFAULT 0,
  verifie       BOOLEAN DEFAULT false,
  ajoute_par    UUID REFERENCES utilisateurs(id),
  actif         BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Lignes et tarifs
CREATE TABLE IF NOT EXISTS lignes_interurbaines (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agence_id         UUID REFERENCES agences_voyage(id) ON DELETE CASCADE,
  ville_depart      TEXT NOT NULL,
  ville_arrivee     TEXT NOT NULL,
  prix_standard     INT,
  prix_vip          INT,
  duree_estimee_min INT,
  horaires_json     JSONB DEFAULT '[]',
  places_totales    INT DEFAULT 70,
  ajoute_par        UUID REFERENCES utilisateurs(id),
  date_maj          TIMESTAMPTZ DEFAULT NOW(),
  actif             BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Departs specifiques avec places disponibles
CREATE TABLE IF NOT EXISTS departs_interurbains (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ligne_id           UUID REFERENCES lignes_interurbaines(id) ON DELETE CASCADE,
  date_heure_depart  TIMESTAMPTZ NOT NULL,
  places_disponibles INT,
  statut             TEXT DEFAULT 'planifie' CHECK (statut IN ('planifie','complet','parti','annule')),
  source             TEXT DEFAULT 'communaute' CHECK (source IN ('agence','communaute')),
  signale_par        UUID REFERENCES utilisateurs(id),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Signalements de prix incorrects
CREATE TABLE IF NOT EXISTS signalements_prix (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ligne_id        UUID REFERENCES lignes_interurbaines(id) ON DELETE CASCADE,
  ancien_prix     INT,
  nouveau_prix    INT NOT NULL,
  classe          TEXT DEFAULT 'standard' CHECK (classe IN ('standard','vip')),
  signale_par     UUID REFERENCES utilisateurs(id),
  nb_validations  INT DEFAULT 0,
  statut          TEXT DEFAULT 'en_attente' CHECK (statut IN ('en_attente','valide','rejete')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Avis voyageurs
CREATE TABLE IF NOT EXISTS avis_agences (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agence_id   UUID REFERENCES agences_voyage(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES utilisateurs(id),
  note        INT CHECK (note BETWEEN 1 AND 5),
  commentaire TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agence_id, user_id)
);

-- Stats de recherches pour le futur radar agences
CREATE TABLE IF NOT EXISTS recherches_interurbain (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ville_depart  TEXT NOT NULL,
  ville_arrivee TEXT NOT NULL,
  nb_resultats  INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_lignes_trajet ON lignes_interurbaines(ville_depart, ville_arrivee) WHERE actif = true;
CREATE INDEX IF NOT EXISTS idx_lignes_agence ON lignes_interurbaines(agence_id);
CREATE INDEX IF NOT EXISTS idx_departs_ligne_date ON departs_interurbains(ligne_id, date_heure_depart);
CREATE INDEX IF NOT EXISTS idx_signalements_ligne ON signalements_prix(ligne_id, statut);
CREATE INDEX IF NOT EXISTS idx_recherches_trajet ON recherches_interurbain(ville_depart, ville_arrivee);

-- Realtime sur les departs
ALTER PUBLICATION supabase_realtime ADD TABLE departs_interurbains;
