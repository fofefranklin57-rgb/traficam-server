const { supabase } = require('../../lib/supabase');
const cors = require('../../lib/cors');

const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPO_URL = 'https://exp.host/--/api/v2/push/send';

function distKm(la1, lo1, la2, lo2) {
  const R = 6371, dLa = (la2-la1)*Math.PI/180, dLo = (lo2-lo1)*Math.PI/180;
  const a = Math.sin(dLa/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function estNuit() { const h = new Date().getHours(); return h >= 22 || h < 5; }

function tarifSuggere(type) {
  const nuit = estNuit();
  if (type === 'ramassage')      return nuit ? 400  : 350;
  if (type === 'depot')          return nuit ? 4000 : 3500;
  return null;
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  const params = [].concat(req.query.params || []);
  const [id, action] = params;

  // ── POST /api/courses/:id/accepter ────────────────────────────────────────
  if (id && action === 'accepter') {
    if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });
    const { taximan_id } = req.body;
    const { data: course, error: e1 } = await supabase.from('courses')
      .select('*, client:client_id(push_token, telephone, nom)').eq('id', id).eq('statut', 'en_attente').single();
    if (e1 || !course) return res.status(404).json({ erreur: 'Course introuvable ou déjà acceptée' });
    const { data: taximan } = await supabase.from('utilisateurs').select('telephone, nom').eq('id', taximan_id).single();
    const { data: updated, error: e2 } = await supabase.from('courses').update({ statut: 'acceptee', taximan_id }).eq('id', id).select().single();
    if (e2) return res.status(500).json({ erreur: e2.message });
    const pushToken = course.client?.push_token;
    if (pushToken?.startsWith('ExponentPushToken')) {
      const nomTaximan = taximan?.nom ?? 'Un taximan';
      await fetch(EXPO_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ to: pushToken, title: '🚕 Taximan trouvé !',
          body: `${nomTaximan} accepte votre course vers ${course.arrivee_nom}. Tél : ${taximan?.telephone ?? ''}`,
          sound: 'default', data: { type: 'course_acceptee', courseId: id }, priority: 'high', channelId: 'traficam' }),
      }).catch(() => {});
    }
    return res.json({ success: true, course: updated, taximan: { telephone: taximan?.telephone, nom: taximan?.nom }, client: { telephone: course.client?.telephone, nom: course.client?.nom } });
  }

  // ── POST /api/courses/:id/annuler ─────────────────────────────────────────
  if (id && action === 'annuler') {
    if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });
    const { data, error } = await supabase.from('courses').update({ statut: 'annulee' }).eq('id', id).in('statut', ['en_attente', 'acceptee']).select().single();
    if (error) return res.status(500).json({ erreur: error.message });
    return res.json({ success: true, course: data });
  }

  // ── GET /api/courses ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { mode, lat, lng, rayon = '10', client_id, type_course, type_vehicule } = req.query;
    if (mode === 'client' && UUID_RE.test(client_id)) {
      const { data, error } = await supabase.from('courses').select('*, taximan:taximan_id(telephone, nom)')
        .eq('client_id', client_id).not('statut', 'in', '("terminee","annulee")').order('created_at', { ascending: false });
      if (error) return res.status(500).json({ erreur: error.message });
      return res.json({ success: true, courses: data });
    }
    let query = supabase.from('courses').select('*, client:client_id(telephone, nom)').eq('statut', 'en_attente').order('created_at', { ascending: false }).limit(100);
    if (type_course) query = query.eq('type_course', type_course);
    if (type_vehicule === 'taxi') query = query.in('vehicule_accepte', ['taxi', 'tous']);
    if (type_vehicule === 'moto') query = query.in('vehicule_accepte', ['moto', 'tous']);
    const { data, error } = await query;
    if (error) return res.status(500).json({ erreur: error.message });
    let courses = data;
    if (lat && lng) courses = courses.filter(c => distKm(parseFloat(lat), parseFloat(lng), c.depart_lat, c.depart_lng) <= parseFloat(rayon));
    const groupesRamassage = {};
    const autresCourses = [];
    courses.forEach(c => {
      if (c.type_course === 'ramassage') {
        const key = c.arrivee_nom.trim().toLowerCase();
        if (!groupesRamassage[key]) groupesRamassage[key] = { destination: c.arrivee_nom, arrivee_lat: c.arrivee_lat, arrivee_lng: c.arrivee_lng, nb_clients: 0, prix_min: Infinity, prix_max: 0, prix_moyen: 0, total_prix: 0, ids: [] };
        const g = groupesRamassage[key];
        g.nb_clients++; g.ids.push(c.id);
        if (c.prix_propose) { g.prix_min = Math.min(g.prix_min, c.prix_propose); g.prix_max = Math.max(g.prix_max, c.prix_propose); g.total_prix += c.prix_propose; g.prix_moyen = Math.round(g.total_prix / g.nb_clients); }
        if (lat && lng && !g.distance_km) g.distance_km = Math.round(distKm(parseFloat(lat), parseFloat(lng), c.depart_lat, c.depart_lng) * 10) / 10;
      } else {
        c._distance_km = lat && lng ? Math.round(distKm(parseFloat(lat), parseFloat(lng), c.depart_lat, c.depart_lng) * 10) / 10 : null;
        autresCourses.push(c);
      }
    });
    Object.values(groupesRamassage).forEach(g => { if (g.prix_min === Infinity) { g.prix_min = null; g.prix_max = null; } });
    const ramassages = Object.values(groupesRamassage).sort((a, b) => b.nb_clients - a.nb_clients);
    autresCourses.sort((a, b) => (a._distance_km ?? 99) - (b._distance_km ?? 99));
    return res.json({ success: true, ramassages, autres: autresCourses, tarifs: { ramassage_jour: 350, ramassage_nuit: 400, depot_jour: 3500, depot_nuit: 4000 }, heure_nuit: estNuit() });
  }

  // ── POST /api/courses ─────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { client_id, type_course = 'ramassage', depart_lat, depart_lng, depart_nom, arrivee_nom, arrivee_lat, arrivee_lng, prix_propose, nb_passagers = 1, telephone_client } = req.body;
    if (!depart_lat || !depart_lng || !depart_nom || !arrivee_nom) return res.status(400).json({ erreur: 'Départ et destination obligatoires' });
    const nuit = estNuit();
    const tarif = tarifSuggere(type_course);
    const prix = prix_propose ? parseInt(prix_propose) : tarif;
    const { data: course, error } = await supabase.from('courses').insert([{
      client_id: UUID_RE.test(client_id) ? client_id : null, type_course,
      depart_lat, depart_lng, depart_nom, arrivee_nom, arrivee_lat, arrivee_lng,
      prix_propose: prix, nb_passagers: parseInt(nb_passagers), telephone_client,
      vehicule_accepte: req.body.vehicule_accepte || 'tous', heure_nuit: nuit,
    }]).select().single();
    if (error) return res.status(500).json({ erreur: error.message });
    return res.status(201).json({ success: true, course, tarif_suggere: tarif, heure_nuit: nuit });
  }

  res.status(405).json({ erreur: 'Méthode non autorisée' });
};
