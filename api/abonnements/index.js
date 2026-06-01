const supabase = require('../../lib/supabase');
const cors     = require('../../lib/cors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PLANS = {
  conducteur:       { montant: 2000, label: 'Conducteur',        duree_jours: 30 },
  agence_essentiel: { montant: 5000, label: 'Agence Essentiel',  duree_jours: 30 },
  agence_pro:       { montant: 15000, label: 'Agence Pro',       duree_jours: 30 },
};

const CAMPAY_URL  = 'https://immogest1.fofefranklin57.workers.dev';
const CAMPAY_ENV  = process.env.CAMPAY_ENV  || 'demo';
const CAMPAY_TOKEN = process.env.CAMPAY_TOKEN;

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  // ── GET /api/abonnements?user_id=xxx ─────────────────────────────────────
  if (req.method === 'GET') {
    const { user_id } = req.query;
    if (!UUID_RE.test(user_id)) return res.status(400).json({ erreur: 'user_id invalide' });

    // Expire les abonnements dépassés
    await supabase.rpc('expire_abonnements').catch(() => {});

    const { data, error } = await supabase
      .from('abonnements_traficam')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) return res.status(500).json({ erreur: error.message });

    const actif = data?.find(a => a.statut === 'actif') ?? null;
    return res.json({ success: true, abonnement_actif: actif, historique: data });
  }

  // ── POST /api/abonnements — Initier un paiement CamPay ───────────────────
  if (req.method === 'POST') {
    const { user_id, plan, telephone } = req.body;

    if (!UUID_RE.test(user_id)) return res.status(400).json({ erreur: 'user_id invalide' });
    if (!PLANS[plan])           return res.status(400).json({ erreur: 'Plan inconnu' });
    if (!telephone)             return res.status(400).json({ erreur: 'Téléphone requis' });

    const { montant, label } = PLANS[plan];

    // Créer la ligne en attente dans Supabase
    const { data: abo, error: errAbo } = await supabase
      .from('abonnements_traficam')
      .insert([{
        user_id,
        plan,
        montant,
        statut:            'en_attente',
        telephone_paiement: telephone,
      }])
      .select()
      .single();

    if (errAbo) return res.status(500).json({ erreur: errAbo.message });

    // Initier le paiement via le Worker CamPay (même architecture qu'ImmoGest)
    let campay_ref = null;
    let campay_err = null;

    try {
      const body = JSON.stringify({
        montant,
        telephone,
        description: `TrafiCam — Abonnement ${label}`,
        external_id:  abo.id,
        env:          CAMPAY_ENV,
      });

      const resp = await fetch(`${CAMPAY_URL}/campay-initier`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${CAMPAY_TOKEN}`,
        },
        body,
      });

      const json = await resp.json();
      if (json.reference) {
        campay_ref = json.reference;
        await supabase
          .from('abonnements_traficam')
          .update({ reference_campay: campay_ref })
          .eq('id', abo.id);
      } else {
        campay_err = json.erreur || 'Erreur CamPay';
      }
    } catch (e) {
      campay_err = e.message;
    }

    if (campay_err) {
      return res.status(502).json({ erreur: campay_err, abonnement_id: abo.id });
    }

    return res.status(201).json({
      success:        true,
      abonnement_id:  abo.id,
      reference:      campay_ref,
      montant,
      plan,
    });
  }

  res.status(405).json({ erreur: 'Méthode non autorisée' });
};
