const supabase = require('../../lib/supabase');
const cors = require('../../lib/cors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function distKm(la1, lo1, la2, lo2) {
  const R = 6371, dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  // ── GET /api/courses ──────────────────────────────────────────────────────
  // ?mode=taximan&lat=X&lng=Y&rayon=5  → demandes en attente proches
  // ?mode=client&client_id=UUID        → mes demandes actives
  if (req.method === 'GET') {
    const { mode, lat, lng, rayon = '10', client_id } = req.query;

    if (mode === 'client' && UUID_RE.test(client_id)) {
      // Mes demandes (toutes sauf annulées/terminées)
      const { data, error } = await supabase
        .from('courses')
        .select('*, taximan:taximan_id(telephone, nom)')
        .eq('client_id', client_id)
        .not('statut', 'in', '("terminee","annulee")')
        .order('created_at', { ascending: false });

      if (error) return res.status(500).json({ erreur: error.message });
      return res.json({ success: true, courses: data });
    }

    // Mode taximan : demandes en attente dans le rayon
    const { data, error } = await supabase
      .from('courses')
      .select('*, client:client_id(telephone, nom)')
      .eq('statut', 'en_attente')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return res.status(500).json({ erreur: error.message });

    let courses = data;

    // Filtrer par rayon GPS si fourni
    if (lat && lng) {
      courses = courses.filter(c =>
        distKm(parseFloat(lat), parseFloat(lng), c.depart_lat, c.depart_lng) <= parseFloat(rayon)
      );
    }

    // Calculer la popularité des destinations (pour aider le taximan)
    const popularite = {};
    courses.forEach(c => {
      const key = c.arrivee_nom.toLowerCase().trim();
      popularite[key] = (popularite[key] || 0) + 1;
    });

    const coursesAvecPop = courses.map(c => ({
      ...c,
      popularite_destination: popularite[c.arrivee_nom.toLowerCase().trim()] || 1,
      distance_depart_km: lat && lng
        ? Math.round(distKm(parseFloat(lat), parseFloat(lng), c.depart_lat, c.depart_lng) * 10) / 10
        : null,
    }));

    // Trier : popularité desc, puis proximité asc
    coursesAvecPop.sort((a, b) => {
      if (b.popularite_destination !== a.popularite_destination)
        return b.popularite_destination - a.popularite_destination;
      return (a.distance_depart_km ?? 99) - (b.distance_depart_km ?? 99);
    });

    return res.json({ success: true, courses: coursesAvecPop, popularite });
  }

  // ── POST /api/courses ─────────────────────────────────────────────────────
  // Client crée une demande
  if (req.method === 'POST') {
    const {
      client_id, depart_lat, depart_lng, depart_nom,
      arrivee_nom, arrivee_lat, arrivee_lng,
      prix_propose, nb_passagers = 1, telephone_client,
    } = req.body;

    if (!depart_lat || !depart_lng || !depart_nom || !arrivee_nom) {
      return res.status(400).json({ erreur: 'Départ et destination obligatoires' });
    }

    const { data: course, error } = await supabase
      .from('courses')
      .insert([{
        client_id: UUID_RE.test(client_id) ? client_id : null,
        depart_lat, depart_lng, depart_nom,
        arrivee_nom, arrivee_lat, arrivee_lng,
        prix_propose: prix_propose ? parseInt(prix_propose) : null,
        nb_passagers: parseInt(nb_passagers),
        telephone_client,
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ erreur: error.message });

    // Supabase Realtime notifie les taximen abonnés automatiquement
    return res.status(201).json({ success: true, course });
  }

  res.status(405).json({ erreur: 'Méthode non autorisée' });
};
