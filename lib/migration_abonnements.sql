-- TrafiCam — Migration : Module Abonnements + CamPay
-- Executer dans Supabase SQL Editor

CREATE TABLE IF NOT EXISTS abonnements_traficam (
  id                UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID    REFERENCES utilisateurs(id) ON DELETE CASCADE,
  plan              TEXT    NOT NULL CHECK (plan IN ('gratuit','conducteur','agence_essentiel','agence_pro')),
  statut            TEXT    NOT NULL DEFAULT 'en_attente'
                            CHECK (statut IN ('en_attente','actif','expire','echec')),
  date_debut        TIMESTAMPTZ,
  date_fin          TIMESTAMPTZ,
  montant           INT     NOT NULL DEFAULT 0,
  reference_campay  TEXT,
  telephone_paiement TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abo_user     ON abonnements_traficam(user_id, statut);
CREATE INDEX IF NOT EXISTS idx_abo_campay   ON abonnements_traficam(reference_campay) WHERE reference_campay IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_abo_expiry   ON abonnements_traficam(date_fin) WHERE statut = 'actif';

-- Expire les abonnements dépassés automatiquement
-- (à appeler via cron ou à la connexion de l'utilisateur)
CREATE OR REPLACE FUNCTION expire_abonnements()
RETURNS void LANGUAGE sql AS $$
  UPDATE abonnements_traficam
  SET statut = 'expire', updated_at = NOW()
  WHERE statut = 'actif' AND date_fin < NOW();
$$;
