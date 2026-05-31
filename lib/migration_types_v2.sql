-- TrafiCam — Migration v2 : nouveaux types d'incidents
-- Coller dans Supabase Dashboard → SQL Editor → Run

-- 1. Supprimer l'ancienne contrainte de type
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_type_check;

-- 2. Ajouter les nouveaux types
ALTER TABLE incidents
  ADD CONSTRAINT incidents_type_check
  CHECK (type IN ('accident', 'bouchon', 'route_bloquee', 'chantier', 'nid_de_poule'));

-- 3. Vérification
SELECT DISTINCT type FROM incidents;
