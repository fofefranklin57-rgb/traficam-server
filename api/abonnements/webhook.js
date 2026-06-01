const supabase = require('../../lib/supabase');
const cors     = require('../../lib/cors');

const DUREES = {
  conducteur:       30,
  agence_essentiel: 30,
  agence_pro:       30,
};

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });

  const { reference, statut, external_id } = req.body;

  // statut CamPay : 'SUCCESSFUL' | 'FAILED'
  if (!reference && !external_id) {
    return res.status(400).json({ erreur: 'Données webhook manquantes' });
  }

  // Chercher l'abonnement
  let query = supabase.from('abonnements_traficam').select('*');
  if (external_id) query = query.eq('id', external_id);
  else             query = query.eq('reference_campay', reference);

  const { data: abo, error } = await query.single();
  if (error || !abo) return res.status(404).json({ erreur: 'Abonnement introuvable' });

  if (statut === 'SUCCESSFUL') {
    const now     = new Date();
    const fin     = new Date(now);
    fin.setDate(fin.getDate() + (DUREES[abo.plan] ?? 30));

    const { error: errUpd } = await supabase
      .from('abonnements_traficam')
      .update({
        statut:     'actif',
        date_debut: now.toISOString(),
        date_fin:   fin.toISOString(),
        reference_campay: reference || abo.reference_campay,
        updated_at: now.toISOString(),
      })
      .eq('id', abo.id);

    if (errUpd) return res.status(500).json({ erreur: errUpd.message });

    // Mettre à jour le plan et la date d'expiration sur l'utilisateur
    await supabase
      .from('utilisateurs')
      .update({ plan: abo.plan, plan_expire_at: fin.toISOString() })
      .eq('id', abo.user_id);

    return res.json({ success: true, message: 'Abonnement activé' });
  }

  if (statut === 'FAILED') {
    await supabase
      .from('abonnements_traficam')
      .update({ statut: 'echec', updated_at: new Date().toISOString() })
      .eq('id', abo.id);

    return res.json({ success: true, message: 'Paiement échoué enregistré' });
  }

  return res.json({ success: true, message: 'Statut ignoré' });
};
