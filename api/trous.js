const { supabase } = require('../lib/supabase');
const cors = require('../lib/cors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function distKm(la1, lo1, la2, lo2) {
  const R = 6371, dLa = (la2-la1)*Math.PI/180, dLo = (lo2-lo1)*Math.PI/180;
  const a = Math.sin(dLa/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  const _parts = req.url.split('?')[0].split('/').filter(Boolean); const _base = _parts.indexOf('trous'); const id = _base >= 0 && _parts.length > _base + 1 ? _parts[_base + 1] : null; const action = _base >= 0 && _parts.length > _base + 2 ? _parts[_base + 2] : null;

  // ── POST /api/trous/:id/confirmer ─────────────────────────────────────────
  if (id && action === 'confirmer') {
    if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });
    const { data: current, error: e1 } = await supabase.from('trous_route').select('confirmations, signale_par').eq('id', id).single();
    if (e1) return res.status(404).json({ erreur: 'Trou introuvable' });
    const { data: trou, error: e2 } = await supabase.from('trous_route')
      .update({ confirmations: current.confirmations + 1 }).eq('id', id).select().single();
    if (e2) return res.status(500).json({ erreur: e2.message });
    if (current.signale_par) {
      supabase.from('utilisateurs').select('points').eq('id', current.signale_par).single()
        .then(({ data: u }) => { if (u) supabase.from('utilisateurs').update({ points: u.points + 3 }).eq('id', current.signale_par); });
    }
    return res.json({ success: true, trou });
  }

  // ── POST /api/trous/:id/signaler_repare ───────────────────────────────────
  if (id && action === 'signaler_repare') {
    if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });
    const { data: trou, error } = await supabase.from('trous_route').update({ actif: false }).eq('id', id).select().single();
    if (error) return res.status(500).json({ erreur: error.message });
    return res.json({ success: true, trou });
  }

  // ── GET/POST /api/trous ───────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { lat, lng, rayon = '5' } = req.query;
    const { data, error } = await supabase.from('trous_route').select('*').eq('actif', true).order('confirmations', { ascending: false });
    if (error) return res.status(500).json({ erreur: error.message });
    const trous = data.filter(t => !lat || !lng || distKm(parseFloat(lat), parseFloat(lng), t.latitude, t.longitude) <= parseFloat(rayon));
    return res.json({ success: true, count: trous.length, trous });
  }

  if (req.method === 'POST') {
    const { latitude, longitude, severite = 'moyen', description, signale_par } = req.body;
    if (!latitude || !longitude) return res.status(400).json({ erreur: 'Coordonnées manquantes' });
    const { data: existants } = await supabase.from('trous_route').select('id, confirmations').eq('actif', true);
    const doublon = (existants || []).find(t => distKm(parseFloat(latitude), parseFloat(longitude), t.latitude, t.longitude) < 0.03);
    if (doublon) {
      const { data: trou } = await supabase.from('trous_route').update({ confirmations: doublon.confirmations + 1 }).eq('id', doublon.id).select().single();
      return res.json({ success: true, trou, doublon: true });
    }
    const signaledBy = UUID_RE.test(signale_par) ? signale_par : null;
    const { data: trou, error } = await supabase.from('trous_route').insert([{ latitude, longitude, severite, description, signale_par: signaledBy }]).select().single();
    if (error) return res.status(500).json({ erreur: error.message });
    if (signaledBy) {
      supabase.from('utilisateurs').select('points').eq('id', signaledBy).single()
        .then(({ data: u }) => { if (u) supabase.from('utilisateurs').update({ points: u.points + 10 }).eq('id', signaledBy); });
    }
    return res.status(201).json({ success: true, trou });
  }

  res.status(405).json({ erreur: 'Méthode non autorisée' });
};
