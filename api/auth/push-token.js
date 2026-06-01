const supabase = require('../../lib/supabase');
const cors     = require('../../lib/cors');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });

  const { utilisateur_id, push_token } = req.body;
  if (!push_token) return res.status(400).json({ erreur: 'Token manquant' });

  if (UUID_RE.test(utilisateur_id)) {
    await supabase.from('utilisateurs').update({ push_token }).eq('id', utilisateur_id);

    // Vérifier si des objets trouvés correspondent à cet utilisateur
    const { data: user } = await supabase
      .from('utilisateurs')
      .select('nom, telephone')
      .eq('id', utilisateur_id)
      .single();

    if (user && push_token.startsWith('ExponentPushToken')) {
      const conditions = [];
      if (user.telephone) conditions.push(`telephone_sur_objet.eq.${user.telephone}`);
      if (user.nom)       conditions.push(`nom_sur_objet.ilike.%${user.nom}%`);

      if (conditions.length > 0) {
        const { data: objets } = await supabase
          .from('objets_trouves')
          .select('id, type_objet, lieu_depot')
          .or(conditions.join(','))
          .eq('statut', 'disponible')
          .limit(3);

        if (objets?.length > 0) {
          // Mettre à jour le statut et notifier
          const ids = objets.map(o => o.id);
          await supabase.from('objets_trouves')
            .update({ statut: 'notifie', notifie_user_id: utilisateur_id })
            .in('id', ids);

          const nb = objets.length;
          const lieu = objets[0].lieu_depot;

          await fetch(EXPO_PUSH_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify([{
              to:       push_token,
              title:    `📦 ${nb > 1 ? `${nb} objets trouvés` : 'Un objet trouvé'} à votre nom !`,
              body:     `Déposé à : ${lieu}. Ouvrez TrafiCam → Objets Trouvés pour les détails.`,
              sound:    'default',
              priority: 'high',
              data:     { type: 'objets_trouves', nb, objetId: objets[0].id },
            }]),
          });
        }
      }
    }
  }

  res.json({ success: true });
};
