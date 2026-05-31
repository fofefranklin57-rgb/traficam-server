const supabase = require('../../lib/supabase');
const cors     = require('../../lib/cors');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ erreur: 'Méthode non autorisée' });

  const { depart, arrivee } = req.query;
  if (!depart || !arrivee) {
    return res.status(400).json({ erreur: 'Ville de départ et arrivée requises' });
  }

  // Recherche insensible à la casse
  const dep = depart.trim();
  const arr = arrivee.trim();

  const { data: lignes, error } = await supabase
    .from('lignes_interurbaines')
    .select(`
      *,
      agence:agence_id (
        id, nom, telephone, ville_base, gare_routiere,
        note_moyenne, nb_avis, verifie
      )
    `)
    .ilike('ville_depart', `%${dep}%`)
    .ilike('ville_arrivee', `%${arr}%`)
    .eq('actif', true)
    .order('prix_standard', { ascending: true, nullsFirst: false });

  if (error) return res.status(500).json({ erreur: error.message });

  // Ajouter les prochains départs pour chaque ligne
  const maintenant = new Date().toISOString();
  const lignesIds  = lignes.map(l => l.id);

  let departs = [];
  if (lignesIds.length > 0) {
    const { data: d } = await supabase
      .from('departs_interurbains')
      .select('*')
      .in('ligne_id', lignesIds)
      .gte('date_heure_depart', maintenant)
      .neq('statut', 'annule')
      .order('date_heure_depart', { ascending: true })
      .limit(200);
    departs = d ?? [];
  }

  // Associer les départs à chaque ligne
  const result = lignes.map(l => ({
    ...l,
    prochains_departs: departs
      .filter(d => d.ligne_id === l.id)
      .slice(0, 5),
  }));

  // Enregistrer la recherche pour les stats (non bloquant)
  supabase.from('recherches_interurbain')
    .insert([{ ville_depart: dep, ville_arrivee: arr, nb_resultats: result.length }])
    .then(() => {})
    .catch(() => {});

  res.json({ success: true, lignes: result, nb: result.length });
};
