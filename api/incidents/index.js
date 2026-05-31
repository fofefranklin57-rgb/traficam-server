const supabase = require('../../lib/supabase');
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
  // Lecture puis écriture (Supabase anon key ne supporte pas les updates relatifs)
  const { data: u } = await supabase
    .from('utilisateurs').select('signalements, confirmations, points').eq('id', userId).single();
  if (!u) return;
  const update = {};
  if (champs.signalements) update.signalements = u.signalements + champs.signalements;
  if (champs.confirmations) update.confirmations = u.confirmations + champs.confirmations;
  if (champs.points) update.points = u.points + champs.points;
  await supabase.from('utilisateurs').update(update).eq('id', userId);
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  // GET /api/incidents
  if (req.method === 'GET') {
    const { lat, lng, rayon = '5' } = req.query;
    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .eq('statut', 'actif')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ erreur: error.message });

    const incidents = data
      .filter(i => !lat || !lng || distKm(parseFloat(lat), parseFloat(lng), i.latitude, i.longitude) <= parseFloat(rayon))
      .map(i => ({ ...i, temps: tempsEcoule(i.created_at) }));

    return res.json({ success: true, count: incidents.length, incidents });
  }

  // POST /api/incidents
  if (req.method === 'POST') {
    const { type, gravite, lieu, description, latitude, longitude, photo_url, signale_par, source } = req.body;
    if (!type || !gravite || !lieu || !latitude || !longitude) {
      return res.status(400).json({ erreur: 'Champs obligatoires manquants' });
    }

    // N'insérer signale_par que si c'est un UUID valide
    const signaledBy = UUID_RE.test(signale_par) ? signale_par : null;

    const { data: incident, error } = await supabase
      .from('incidents')
      .insert([{ type, gravite, lieu, description, latitude, longitude, photo_url, signale_par: signaledBy, source: source || 'user' }])
      .select()
      .single();

    if (error) return res.status(500).json({ erreur: error.message });

    // +1 signalement, +10 points pour le signaleur (fire & forget)
    if (signaledBy) {
      incrementerStats(signaledBy, { signalements: 1, points: 10 }).catch(() => {});
    }

    // Supabase Realtime notifie les clients abonnés + push notifications
    notifierUsersProches(incident).catch(() => {});

    return res.status(201).json({ success: true, incident: { ...incident, temps: 'À l\'instant' } });
  }

  res.status(405).json({ erreur: 'Méthode non autorisée' });
};
