const supabase = require('../../lib/supabase');
const cors = require('../../lib/cors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function distKm(la1, lo1, la2, lo2) {
  const R = 6371, dLa = (la2-la1)*Math.PI/180, dLo = (lo2-lo1)*Math.PI/180;
  const a = Math.sin(dLa/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  // GET /api/trous?lat=X&lng=Y&rayon=5
  if (req.method === 'GET') {
    const { lat, lng, rayon = '5' } = req.query;

    const { data, error } = await supabase
      .from('trous_route')
      .select('*')
      .eq('actif', true)
      .order('confirmations', { ascending: false });

    if (error) return res.status(500).json({ erreur: error.message });

    const trous = data.filter(t =>
      !lat || !lng || distKm(parseFloat(lat), parseFloat(lng), t.latitude, t.longitude) <= parseFloat(rayon)
    );

    return res.json({ success: true, count: trous.length, trous });
  }

  // POST /api/trous
  if (req.method === 'POST') {
    const { latitude, longitude, severite = 'moyen', description, signale_par } = req.body;
    if (!latitude || !longitude) {
      return res.status(400).json({ erreur: 'Coordonnées manquantes' });
    }

    // Vérifier si un trou similaire existe déjà dans un rayon de 30m
    const { data: existants } = await supabase
      .from('trous_route').select('id, confirmations').eq('actif', true);

    const doublon = (existants || []).find(t =>
      distKm(parseFloat(latitude), parseFloat(longitude), t.latitude, t.longitude) < 0.03
    );

    if (doublon) {
      // Incrémenter les confirmations du trou existant au lieu d'en créer un nouveau
      const { data: trou } = await supabase
        .from('trous_route')
        .update({ confirmations: doublon.confirmations + 1 })
        .eq('id', doublon.id).select().single();
      return res.json({ success: true, trou, doublon: true });
    }

    const signaledBy = UUID_RE.test(signale_par) ? signale_par : null;
    const { data: trou, error } = await supabase
      .from('trous_route')
      .insert([{ latitude, longitude, severite, description, signale_par: signaledBy }])
      .select().single();

    if (error) return res.status(500).json({ erreur: error.message });

    // +10 points pour le signaleur
    if (signaledBy) {
      supabase.from('utilisateurs').select('points').eq('id', signaledBy).single()
        .then(({ data: u }) => {
          if (u) supabase.from('utilisateurs').update({ points: u.points + 10 }).eq('id', signaledBy);
        });
    }

    return res.status(201).json({ success: true, trou });
  }

  res.status(405).json({ erreur: 'Méthode non autorisée' });
};
