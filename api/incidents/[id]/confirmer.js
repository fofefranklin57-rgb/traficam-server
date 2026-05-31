const supabase = require('../../../lib/supabase');
const cors = require('../../../lib/cors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function incrementerStats(userId, champs) {
  const { data: u } = await supabase
    .from('utilisateurs').select('signalements, confirmations, points').eq('id', userId).single();
  if (!u) return;
  const update = {};
  if (champs.confirmations) update.confirmations = u.confirmations + champs.confirmations;
  if (champs.points) update.points = u.points + champs.points;
  await supabase.from('utilisateurs').update(update).eq('id', userId);
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });

  const { id } = req.query;

  const { data: current, error: e1 } = await supabase
    .from('incidents').select('confirmations, signale_par').eq('id', id).single();
  if (e1) return res.status(404).json({ erreur: 'Incident introuvable' });

  const { data: incident, error: e2 } = await supabase
    .from('incidents')
    .update({ confirmations: current.confirmations + 1 })
    .eq('id', id).select().single();
  if (e2) return res.status(500).json({ erreur: e2.message });

  // +1 confirmation, +5 points pour le signaleur original (fire & forget)
  if (current.signale_par && UUID_RE.test(current.signale_par)) {
    incrementerStats(current.signale_par, { confirmations: 1, points: 5 }).catch(() => {});
  }

  // Supabase Realtime diffuse automatiquement le UPDATE aux clients abonnés
  res.json({ success: true, incident });
};
