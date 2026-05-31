const supabase = require('../../lib/supabase');
const cors     = require('../../lib/cors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  // GET — liste toutes les agences
  if (req.method === 'GET') {
    const { ville } = req.query;
    let query = supabase
      .from('agences_voyage')
      .select('*')
      .eq('actif', true)
      .order('note_moyenne', { ascending: false });

    if (ville) query = query.ilike('ville_base', `%${ville}%`);

    const { data, error } = await query;
    if (error) return res.status(500).json({ erreur: error.message });
    return res.json({ success: true, agences: data });
  }

  // POST — ajouter une agence
  if (req.method === 'POST') {
    const { nom, telephone, ville_base, gare_routiere, user_id } = req.body;

    if (!nom?.trim() || !ville_base?.trim()) {
      return res.status(400).json({ erreur: 'Nom et ville de base requis' });
    }

    // Vérifier doublon
    const { data: existant } = await supabase
      .from('agences_voyage')
      .select('id, nom')
      .ilike('nom', nom.trim())
      .ilike('ville_base', ville_base.trim())
      .single();

    if (existant) {
      return res.status(409).json({ erreur: 'Cette agence existe déjà', agence: existant });
    }

    const { data, error } = await supabase
      .from('agences_voyage')
      .insert([{
        nom:          nom.trim(),
        telephone:    telephone?.trim() || null,
        ville_base:   ville_base.trim(),
        gare_routiere: gare_routiere?.trim() || null,
        ajoute_par:   UUID_RE.test(user_id) ? user_id : null,
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ erreur: error.message });
    return res.status(201).json({ success: true, agence: data });
  }

  res.status(405).json({ erreur: 'Méthode non autorisée' });
};
