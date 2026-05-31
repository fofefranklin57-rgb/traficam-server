const supabase = require('../../../lib/supabase');
const cors = require('../../../lib/cors');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });

  const { id } = req.query;

  const { data: current, error: e1 } = await supabase
    .from('trous_route').select('confirmations, signale_par').eq('id', id).single();
  if (e1) return res.status(404).json({ erreur: 'Trou introuvable' });

  const { data: trou, error: e2 } = await supabase
    .from('trous_route')
    .update({ confirmations: current.confirmations + 1 })
    .eq('id', id).select().single();
  if (e2) return res.status(500).json({ erreur: e2.message });

  // +3 points au signaleur original (confirmation d'un trou = moins de points qu'un incident)
  if (current.signale_par) {
    supabase.from('utilisateurs').select('points').eq('id', current.signale_par).single()
      .then(({ data: u }) => {
        if (u) supabase.from('utilisateurs').update({ points: u.points + 3 }).eq('id', current.signale_par);
      });
  }

  res.json({ success: true, trou });
};
