const supabase = require('../../../lib/supabase');
const cors = require('../../../lib/cors');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });

  const { id } = req.query;

  const { data: current, error: e1 } = await supabase
    .from('incidents').select('confirmations').eq('id', id).single();
  if (e1) return res.status(404).json({ erreur: 'Incident introuvable' });

  const { data: incident, error: e2 } = await supabase
    .from('incidents')
    .update({ confirmations: current.confirmations + 1 })
    .eq('id', id).select().single();
  if (e2) return res.status(500).json({ erreur: e2.message });

  // Supabase Realtime diffuse automatiquement le UPDATE aux clients abonnés
  res.json({ success: true, incident });
};
