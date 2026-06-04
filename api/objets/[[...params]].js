const { supabase } = require('../../lib/supabase');
const cors = require('../../lib/cors');
const { rechercherEtNotifierProprietaire } = require('../../lib/notifier');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES_VALIDES = ['cni','passeport','permis','telephone','sac','cles','carte_bancaire','autre'];

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  const [route] = [].concat(req.query.params || []);

  // ── POST /api/objets/recuperer ────────────────────────────────────────────
  if (route === 'recuperer') {
    if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });
    const id = req.query.id || req.body?.id;
    if (!UUID_RE.test(id)) return res.status(400).json({ erreur: 'ID invalide' });
    const { data, error } = await supabase.from('objets_trouves')
      .update({ statut: 'recupere', recupere_at: new Date().toISOString() })
      .eq('id', id).neq('statut', 'recupere').select().single();
    if (error) return res.status(500).json({ erreur: error.message });
    if (!data) return res.status(404).json({ erreur: 'Objet introuvable ou déjà récupéré' });
    return res.json({ success: true, objet: data });
  }

  // ── GET/POST /api/objets ──────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { type, nom, ville, limit = '30', offset = '0' } = req.query;
    let query = supabase.from('objets_trouves').select('*, signaleur:signale_par(nom, telephone)')
      .neq('statut', 'recupere').order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    if (type)  query = query.eq('type_objet', type);
    if (nom)   query = query.ilike('nom_sur_objet', `%${nom}%`);
    if (ville) query = query.or(`lieu_trouve.ilike.%${ville}%,lieu_depot.ilike.%${ville}%`);
    const { data, error } = await query;
    if (error) return res.status(500).json({ erreur: error.message });
    return res.json({ success: true, objets: data });
  }

  if (req.method === 'POST') {
    const { type_objet, photo_url, nom_sur_objet, telephone_sur_objet, description, lieu_trouve, lat_trouve, lng_trouve, lieu_depot, depot_lat, depot_lng, signale_par } = req.body;
    if (!TYPES_VALIDES.includes(type_objet)) return res.status(400).json({ erreur: 'Type d\'objet invalide' });
    if (!lieu_depot?.trim()) return res.status(400).json({ erreur: 'Lieu de dépôt obligatoire' });
    const { data: objet, error } = await supabase.from('objets_trouves').insert([{
      type_objet, photo_url: photo_url || null,
      nom_sur_objet: nom_sur_objet?.trim() || null, telephone_sur_objet: telephone_sur_objet?.trim() || null,
      description: description?.trim() || null, lieu_trouve: lieu_trouve?.trim() || null,
      lat_trouve: lat_trouve ? parseFloat(lat_trouve) : null, lng_trouve: lng_trouve ? parseFloat(lng_trouve) : null,
      lieu_depot: lieu_depot.trim(), depot_lat: depot_lat ? parseFloat(depot_lat) : null, depot_lng: depot_lng ? parseFloat(depot_lng) : null,
      signale_par: UUID_RE.test(signale_par) ? signale_par : null,
    }]).select().single();
    if (error) return res.status(500).json({ erreur: error.message });
    let notifie = false;
    if (nom_sur_objet || telephone_sur_objet) {
      const userId = await rechercherEtNotifierProprietaire(nom_sur_objet, telephone_sur_objet, objet.id);
      notifie = !!userId;
    }
    return res.status(201).json({ success: true, objet, notifie, message: notifie ? 'Objet signalé et propriétaire notifié !' : 'Objet signalé.' });
  }

  res.status(405).json({ erreur: 'Méthode non autorisée' });
};
