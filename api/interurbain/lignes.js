const supabase = require('../../lib/supabase');
const cors     = require('../../lib/cors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  // GET — lignes d'une agence
  if (req.method === 'GET') {
    const { agence_id } = req.query;
    if (!UUID_RE.test(agence_id)) {
      return res.status(400).json({ erreur: 'agence_id invalide' });
    }
    const { data, error } = await supabase
      .from('lignes_interurbaines')
      .select('*')
      .eq('agence_id', agence_id)
      .eq('actif', true)
      .order('ville_depart');

    if (error) return res.status(500).json({ erreur: error.message });
    return res.json({ success: true, lignes: data });
  }

  // POST — ajouter ou signaler une ligne / un prix
  if (req.method === 'POST') {
    const {
      agence_id, ville_depart, ville_arrivee,
      prix_standard, prix_vip, duree_estimee_min,
      horaires_json, places_totales, user_id,
    } = req.body;

    if (!UUID_RE.test(agence_id) || !ville_depart?.trim() || !ville_arrivee?.trim()) {
      return res.status(400).json({ erreur: 'agence_id, ville_depart et ville_arrivee requis' });
    }

    // Si la ligne existe déjà, mettre à jour
    const { data: existante } = await supabase
      .from('lignes_interurbaines')
      .select('id')
      .eq('agence_id', agence_id)
      .ilike('ville_depart', ville_depart.trim())
      .ilike('ville_arrivee', ville_arrivee.trim())
      .single();

    if (existante) {
      const update = { date_maj: new Date().toISOString() };
      if (prix_standard) update.prix_standard = parseInt(prix_standard);
      if (prix_vip)      update.prix_vip      = parseInt(prix_vip);
      if (duree_estimee_min) update.duree_estimee_min = parseInt(duree_estimee_min);
      if (horaires_json) update.horaires_json = horaires_json;

      const { data, error } = await supabase
        .from('lignes_interurbaines')
        .update(update)
        .eq('id', existante.id)
        .select()
        .single();

      if (error) return res.status(500).json({ erreur: error.message });
      return res.json({ success: true, ligne: data, mise_a_jour: true });
    }

    const { data, error } = await supabase
      .from('lignes_interurbaines')
      .insert([{
        agence_id,
        ville_depart:      ville_depart.trim(),
        ville_arrivee:     ville_arrivee.trim(),
        prix_standard:     prix_standard ? parseInt(prix_standard) : null,
        prix_vip:          prix_vip      ? parseInt(prix_vip)      : null,
        duree_estimee_min: duree_estimee_min ? parseInt(duree_estimee_min) : null,
        horaires_json:     horaires_json ?? [],
        places_totales:    places_totales ? parseInt(places_totales) : 70,
        ajoute_par:        UUID_RE.test(user_id) ? user_id : null,
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ erreur: error.message });
    return res.status(201).json({ success: true, ligne: data });
  }

  res.status(405).json({ erreur: 'Méthode non autorisée' });
};
