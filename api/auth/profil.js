const supabase = require('../../lib/supabase');
const cors     = require('../../lib/cors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROLES_VALIDES = ['client', 'taximan', 'moto', 'personnel', 'transporteur'];

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'PUT') return res.status(405).json({ erreur: 'Méthode non autorisée' });

  const { user_id, role, type_vehicule, nom } = req.body;

  if (!UUID_RE.test(user_id)) return res.status(400).json({ erreur: 'user_id invalide' });
  if (!ROLES_VALIDES.includes(role)) return res.status(400).json({ erreur: 'Rôle invalide' });

  const update = { role };
  if (type_vehicule) update.type_vehicule = type_vehicule;
  if (nom) update.nom = nom;

  const { data: user, error } = await supabase
    .from('utilisateurs')
    .update(update)
    .eq('id', user_id)
    .select()
    .single();

  if (error) return res.status(500).json({ erreur: error.message });

  res.json({ success: true, utilisateur: user });
};
