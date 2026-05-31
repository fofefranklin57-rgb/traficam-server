const supabase = require('../../../lib/supabase');
const cors = require('../../../lib/cors');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });

  const { id } = req.query;

  const { data, error } = await supabase
    .from('courses')
    .update({ statut: 'annulee' })
    .eq('id', id)
    .in('statut', ['en_attente', 'acceptee'])
    .select()
    .single();

  if (error) return res.status(500).json({ erreur: error.message });
  res.json({ success: true, course: data });
};
