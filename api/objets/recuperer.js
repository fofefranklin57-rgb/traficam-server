const supabase = require('../../lib/supabase');
const cors     = require('../../lib/cors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });

  const id = req.query.id;
  if (!UUID_RE.test(id)) return res.status(400).json({ erreur: 'ID invalide' });

  const { data, error } = await supabase
    .from('objets_trouves')
    .update({ statut: 'recupere', recupere_at: new Date().toISOString() })
    .eq('id', id)
    .neq('statut', 'recupere')
    .select()
    .single();

  if (error) return res.status(500).json({ erreur: error.message });
  if (!data)  return res.status(404).json({ erreur: 'Objet introuvable ou déjà récupéré' });

  res.json({ success: true, objet: data });
};
