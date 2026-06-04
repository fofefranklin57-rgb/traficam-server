const { supabase } = require('../../lib/supabase');
const cors = require('../../lib/cors');

const UUID_RE    = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CAMPAY_URL = 'https://immogest1.fofefranklin57.workers.dev';
const CAMPAY_ENV = process.env.CAMPAY_ENV  || 'demo';
const CAMPAY_TOKEN = process.env.CAMPAY_TOKEN;
const DUREES = { conducteur: 30, agence_essentiel: 30, agence_pro: 30 };
const PLANS  = {
  conducteur:       { montant: 2000,  label: 'Conducteur'       },
  agence_essentiel: { montant: 5000,  label: 'Agence Essentiel' },
  agence_pro:       { montant: 15000, label: 'Agence Pro'       },
};

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  const _seg = req.url.split('?')[0].split('/').filter(Boolean); const route = _seg[_seg.length - 1] === 'abonnements' ? null : _seg.find((s, i) => _seg[i-1] === 'abonnements');

  // ── GET /api/abonnements/statut ───────────────────────────────────────────
  if (route === 'statut') {
    if (req.method !== 'GET') return res.status(405).json({ erreur: 'Méthode non autorisée' });
    const { abonnement_id } = req.query;
    if (!abonnement_id) return res.status(400).json({ erreur: 'abonnement_id requis' });
    const { data: abo, error } = await supabase.from('abonnements_traficam').select('*').eq('id', abonnement_id).single();
    if (error || !abo) return res.status(404).json({ erreur: 'Abonnement introuvable' });
    if (abo.statut !== 'en_attente') return res.json({ success: true, statut: abo.statut, abonnement: abo });
    if (abo.reference_campay) {
      try {
        const resp = await fetch(`${CAMPAY_URL}/campay-statut?reference=${abo.reference_campay}&env=${CAMPAY_ENV}`, { headers: { Authorization: `Bearer ${CAMPAY_TOKEN}` } });
        const json = await resp.json();
        if (json.statut === 'SUCCESSFUL') {
          const now = new Date(), fin = new Date(now);
          fin.setDate(fin.getDate() + (DUREES[abo.plan] ?? 30));
          await supabase.from('abonnements_traficam').update({ statut: 'actif', date_debut: now.toISOString(), date_fin: fin.toISOString(), updated_at: now.toISOString() }).eq('id', abo.id);
          await supabase.from('utilisateurs').update({ plan: abo.plan, plan_expire_at: fin.toISOString() }).eq('id', abo.user_id);
          return res.json({ success: true, statut: 'actif' });
        }
        if (json.statut === 'FAILED') {
          await supabase.from('abonnements_traficam').update({ statut: 'echec', updated_at: new Date().toISOString() }).eq('id', abo.id);
          return res.json({ success: true, statut: 'echec' });
        }
      } catch (_) {}
    }
    return res.json({ success: true, statut: 'en_attente' });
  }

  // ── POST /api/abonnements/webhook ─────────────────────────────────────────
  if (route === 'webhook') {
    if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });
    const { reference, statut, external_id } = req.body;
    if (!reference && !external_id) return res.status(400).json({ erreur: 'Données webhook manquantes' });
    let query = supabase.from('abonnements_traficam').select('*');
    if (external_id) query = query.eq('id', external_id);
    else             query = query.eq('reference_campay', reference);
    const { data: abo, error } = await query.single();
    if (error || !abo) return res.status(404).json({ erreur: 'Abonnement introuvable' });
    if (statut === 'SUCCESSFUL') {
      const now = new Date(), fin = new Date(now);
      fin.setDate(fin.getDate() + (DUREES[abo.plan] ?? 30));
      const { error: errUpd } = await supabase.from('abonnements_traficam').update({ statut: 'actif', date_debut: now.toISOString(), date_fin: fin.toISOString(), reference_campay: reference || abo.reference_campay, updated_at: now.toISOString() }).eq('id', abo.id);
      if (errUpd) return res.status(500).json({ erreur: errUpd.message });
      await supabase.from('utilisateurs').update({ plan: abo.plan, plan_expire_at: fin.toISOString() }).eq('id', abo.user_id);
      return res.json({ success: true, message: 'Abonnement activé' });
    }
    if (statut === 'FAILED') {
      await supabase.from('abonnements_traficam').update({ statut: 'echec', updated_at: new Date().toISOString() }).eq('id', abo.id);
      return res.json({ success: true, message: 'Paiement échoué enregistré' });
    }
    return res.json({ success: true, message: 'Statut ignoré' });
  }

  // ── GET/POST /api/abonnements ─────────────────────────────────────────────
  if (req.method === 'GET') {
    const { user_id } = req.query;
    if (!UUID_RE.test(user_id)) return res.status(400).json({ erreur: 'user_id invalide' });
    await supabase.rpc('expire_abonnements').catch(() => {});
    const { data, error } = await supabase.from('abonnements_traficam').select('*').eq('user_id', user_id).order('created_at', { ascending: false }).limit(10);
    if (error) return res.status(500).json({ erreur: error.message });
    return res.json({ success: true, abonnement_actif: data?.find(a => a.statut === 'actif') ?? null, historique: data });
  }

  if (req.method === 'POST') {
    const { user_id, plan, telephone } = req.body;
    if (!UUID_RE.test(user_id)) return res.status(400).json({ erreur: 'user_id invalide' });
    if (!PLANS[plan]) return res.status(400).json({ erreur: 'Plan inconnu' });
    if (!telephone)   return res.status(400).json({ erreur: 'Téléphone requis' });
    const { montant, label } = PLANS[plan];
    const { data: abo, error: errAbo } = await supabase.from('abonnements_traficam').insert([{ user_id, plan, montant, statut: 'en_attente', telephone_paiement: telephone }]).select().single();
    if (errAbo) return res.status(500).json({ erreur: errAbo.message });
    let campay_ref = null, campay_err = null;
    try {
      const resp = await fetch(`${CAMPAY_URL}/campay-initier`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CAMPAY_TOKEN}` }, body: JSON.stringify({ montant, telephone, description: `TrafiCam — Abonnement ${label}`, external_id: abo.id, env: CAMPAY_ENV }) });
      const json = await resp.json();
      if (json.reference) {
        campay_ref = json.reference;
        await supabase.from('abonnements_traficam').update({ reference_campay: campay_ref }).eq('id', abo.id);
      } else campay_err = json.erreur || 'Erreur CamPay';
    } catch (e) { campay_err = e.message; }
    if (campay_err) return res.status(502).json({ erreur: campay_err, abonnement_id: abo.id });
    return res.status(201).json({ success: true, abonnement_id: abo.id, reference: campay_ref, montant, plan });
  }

  res.status(405).json({ erreur: 'Méthode non autorisée' });
};
