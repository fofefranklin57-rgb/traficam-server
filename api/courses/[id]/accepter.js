const supabase = require('../../../lib/supabase');
const cors = require('../../../lib/cors');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });

  const { id } = req.query;
  const { taximan_id } = req.body;

  // Vérifier que la course est encore en attente
  const { data: course, error: e1 } = await supabase
    .from('courses')
    .select('*, client:client_id(push_token, telephone, nom)')
    .eq('id', id)
    .eq('statut', 'en_attente')
    .single();

  if (e1 || !course) {
    return res.status(404).json({ erreur: 'Course introuvable ou déjà acceptée' });
  }

  // Récupérer le numéro du taximan
  const { data: taximan } = await supabase
    .from('utilisateurs')
    .select('telephone, nom')
    .eq('id', taximan_id)
    .single();

  // Accepter la course
  const { data: updated, error: e2 } = await supabase
    .from('courses')
    .update({ statut: 'acceptee', taximan_id })
    .eq('id', id)
    .select()
    .single();

  if (e2) return res.status(500).json({ erreur: e2.message });

  // Notifier le client par push si possible
  const pushToken = course.client?.push_token;
  if (pushToken?.startsWith('ExponentPushToken')) {
    const nomTaximan = taximan?.nom ?? 'Un taximan';
    const tel = taximan?.telephone ?? '';
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: pushToken,
        title: '🚕 Taximan trouvé !',
        body: `${nomTaximan} accepte votre course vers ${course.arrivee_nom}. Tél : ${tel}`,
        sound: 'default',
        data: { type: 'course_acceptee', courseId: id, taximan_tel: tel },
        priority: 'high',
        channelId: 'traficam',
      }),
    }).catch(() => {});
  }

  return res.json({
    success: true,
    course: updated,
    taximan: { telephone: taximan?.telephone, nom: taximan?.nom },
    client: { telephone: course.client?.telephone, nom: course.client?.nom },
  });
};
