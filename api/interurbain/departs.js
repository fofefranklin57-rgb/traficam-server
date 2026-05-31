const supabase = require('../../lib/supabase');
const cors     = require('../../lib/cors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  // GET — prochains départs d'une ligne
  if (req.method === 'GET') {
    const { ligne_id } = req.query;
    if (!UUID_RE.test(ligne_id)) return res.status(400).json({ erreur: 'ligne_id invalide' });

    const maintenant = new Date().toISOString();
    const { data, error } = await supabase
      .from('departs_interurbains')
      .select('*')
      .eq('ligne_id', ligne_id)
      .gte('date_heure_depart', maintenant)
      .neq('statut', 'annule')
      .order('date_heure_depart', { ascending: true })
      .limit(20);

    if (error) return res.status(500).json({ erreur: error.message });
    return res.json({ success: true, departs: data });
  }

  // POST — signaler un départ avec places disponibles
  if (req.method === 'POST') {
    const { ligne_id, date_heure_depart, places_disponibles, user_id } = req.body;

    if (!UUID_RE.test(ligne_id) || !date_heure_depart) {
      return res.status(400).json({ erreur: 'ligne_id et date_heure_depart requis' });
    }

    const heure = new Date(date_heure_depart);
    if (isNaN(heure) || heure < new Date()) {
      return res.status(400).json({ erreur: 'Date de départ invalide ou passée' });
    }

    const { data, error } = await supabase
      .from('departs_interurbains')
      .insert([{
        ligne_id,
        date_heure_depart: heure.toISOString(),
        places_disponibles: places_disponibles ? parseInt(places_disponibles) : null,
        source:     UUID_RE.test(user_id) ? 'communaute' : 'communaute',
        signale_par: UUID_RE.test(user_id) ? user_id : null,
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ erreur: error.message });
    return res.status(201).json({ success: true, depart: data });
  }

  res.status(405).json({ erreur: 'Méthode non autorisée' });
};
