const supabase = require('../../../lib/supabase');
const cors = require('../../../lib/cors');

// Signaler qu'un trou a été réparé → désactivation après 3 signalements
module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });

  const { id } = req.query;

  const { data: trou, error } = await supabase
    .from('trous_route')
    .update({ actif: false })
    .eq('id', id).select().single();

  if (error) return res.status(500).json({ erreur: error.message });
  res.json({ success: true, trou });
};
