const supabase = require('../../../lib/supabase');
const cors = require('../../../lib/cors');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });

  const { id } = req.query;
  const { data: incident, error } = await supabase
    .from('incidents').update({ statut: 'resolu' }).eq('id', id).select().single();
  if (error) return res.status(500).json({ erreur: error.message });

  res.json({ success: true, incident });
};
