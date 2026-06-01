const supabase = require('../../lib/supabase');
const cors     = require('../../lib/cors');

const CAMPAY_URL   = 'https://immogest1.fofefranklin57.workers.dev';
const CAMPAY_TOKEN = process.env.CAMPAY_TOKEN;
const CAMPAY_ENV   = process.env.CAMPAY_ENV || 'demo';

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ erreur: 'Méthode non autorisée' });

  const { abonnement_id } = req.query;
  if (!abonnement_id) return res.status(400).json({ erreur: 'abonnement_id requis' });

  const { data: abo, error } = await supabase
    .from('abonnements_traficam')
    .select('*')
    .eq('id', abonnement_id)
    .single();

  if (error || !abo) return res.status(404).json({ erreur: 'Abonnement introuvable' });

  // Si déjà activé ou échoué, retourner directement
  if (abo.statut !== 'en_attente') {
    return res.json({ success: true, statut: abo.statut, abonnement: abo });
  }

  // Polling status CamPay
  if (abo.reference_campay) {
    try {
      const resp = await fetch(
        `${CAMPAY_URL}/campay-statut?reference=${abo.reference_campay}&env=${CAMPAY_ENV}`,
        { headers: { 'Authorization': `Bearer ${CAMPAY_TOKEN}` } }
      );
      const json = await resp.json();

      if (json.statut === 'SUCCESSFUL') {
        // Déclencher l'activation via le webhook interne
        const DUREES = { conducteur: 30, agence_essentiel: 30, agence_pro: 30 };
        const now = new Date();
        const fin = new Date(now);
        fin.setDate(fin.getDate() + (DUREES[abo.plan] ?? 30));

        await supabase.from('abonnements_traficam').update({
          statut:     'actif',
          date_debut: now.toISOString(),
          date_fin:   fin.toISOString(),
          updated_at: now.toISOString(),
        }).eq('id', abo.id);

        await supabase.from('utilisateurs').update({
          plan: abo.plan, plan_expire_at: fin.toISOString(),
        }).eq('id', abo.user_id);

        return res.json({ success: true, statut: 'actif' });
      }

      if (json.statut === 'FAILED') {
        await supabase.from('abonnements_traficam')
          .update({ statut: 'echec', updated_at: new Date().toISOString() })
          .eq('id', abo.id);
        return res.json({ success: true, statut: 'echec' });
      }
    } catch (_) {}
  }

  return res.json({ success: true, statut: 'en_attente' });
};
