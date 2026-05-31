const supabase = require('../../lib/supabase');
const cors = require('../../lib/cors');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });

  const { utilisateur_id, push_token } = req.body;
  if (!push_token) return res.status(400).json({ erreur: 'Token manquant' });

  if (utilisateur_id) {
    await supabase.from('utilisateurs').update({ push_token }).eq('id', utilisateur_id);
  }

  res.json({ success: true });
};
