const { supabase } = require('../../lib/supabase');
const cors = require('../../lib/cors');
const { notifierUsersProches } = require('../../lib/notifier');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function distKm(la1, lo1, la2, lo2) {
  const R = 6371, dLa = (la2-la1)*Math.PI/180, dLo = (lo2-lo1)*Math.PI/180;
  const a = Math.sin(dLa/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function tempsEcoule(ts) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (diff < 1) return 'À l\'instant';
  if (diff < 60) return `Il y a ${diff} min`;
  if (diff < 1440) return `Il y a ${Math.floor(diff/60)}h`;
  return `Il y a ${Math.floor(diff/1440)}j`;
}

async function incrementerStats(userId, champs) {
  const { data: u } = await supabase.from('utilisateurs').select('signalements, confirmations, points').eq('id', userId).single();
  if (!u) return;
  const update = {};
  if (champs.signalements)  update.signalements  = u.signalements  + champs.signalements;
  if (champs.confirmations) update.confirmations = u.confirmations + champs.confirmations;
  if (champs.points)        update.points        = u.points        + champs.points;
  await supabase.from('utilisateurs').update(update).eq('id', userId);
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  const _parts = req.url.split('?')[0].split('/').filter(Boolean); const _base = _parts.indexOf('incidents'); const id = _base >= 0 && _parts.length > _base + 1 ? _parts[_base + 1] : null; const action = _base >= 0 && _parts.length > _base + 2 ? _parts[_base + 2] : null;

  // ── POST /api/incidents/:id/confirmer ─────────────────────────────────────
  if (id && action === 'confirmer') {
    if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });
    const { data: current, error: e1 } = await supabase.from('incidents').select('confirmations, signale_par').eq('id', id).single();
    if (e1) return res.status(404).json({ erreur: 'Incident introuvable' });
    const { data: incident, error: e2 } = await supabase.from('incidents')
      .update({ confirmations: current.confirmations + 1 }).eq('id', id).select().single();
    if (e2) return res.status(500).json({ erreur: e2.message });
    if (current.signale_par && UUID_RE.test(current.signale_par)) {
      incrementerStats(current.signale_par, { confirmations: 1, points: 5 }).catch(() => {});
    }
    return res.json({ success: true, incident });
  }

  // ── POST /api/incidents/:id/resoudre ──────────────────────────────────────
  if (id && action === 'resoudre') {
    if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });
    const { data: incident, error } = await supabase.from('incidents').update({ statut: 'resolu' }).eq('id', id).select().single();
    if (error) return res.status(500).json({ erreur: error.message });
    return res.json({ success: true, incident });
  }

  // ── GET/POST /api/incidents ───────────────────────────────────────────────
  if (req.method === 'GET') {
    const { lat, lng, rayon = '5' } = req.query;
    const { data, error } = await supabase.from('incidents').select('*').eq('statut', 'actif').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ erreur: error.message });
    const incidents = data
      .filter(i => !lat || !lng || distKm(parseFloat(lat), parseFloat(lng), i.latitude, i.longitude) <= parseFloat(rayon))
      .map(i => ({ ...i, temps: tempsEcoule(i.created_at) }));
    return res.json({ success: true, count: incidents.length, incidents });
  }

  if (req.method === 'POST') {
    const { type, gravite, lieu, description, latitude, longitude, photo_url, signale_par, source } = req.body;
    if (!type || !gravite || !lieu || !latitude || !longitude) {
      return res.status(400).json({ erreur: 'Champs obligatoires manquants' });
    }
    const signaledBy = UUID_RE.test(signale_par) ? signale_par : null;
    const { data: incident, error } = await supabase.from('incidents')
      .insert([{ type, gravite, lieu, description, latitude, longitude, photo_url, signale_par: signaledBy, source: source || 'user' }])
      .select().single();
    if (error) return res.status(500).json({ erreur: error.message });
    if (signaledBy) incrementerStats(signaledBy, { signalements: 1, points: 10 }).catch(() => {});
    notifierUsersProches(incident).catch(() => {});
    return res.status(201).json({ success: true, incident: { ...incident, temps: 'À l\'instant' } });
  }

  res.status(405).json({ erreur: 'Méthode non autorisée' });
};
