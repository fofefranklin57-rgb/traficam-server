const { supabase } = require('../../lib/supabase');
const cors = require('../../lib/cors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  const _seg = req.url.split('?')[0].split('/').filter(Boolean); const route = _seg[_seg.length - 1] === 'interurbain' ? null : _seg.find((s, i) => _seg[i-1] === 'interurbain');

  // ── GET /api/interurbain/recherche ────────────────────────────────────────
  if (route === 'recherche') {
    if (req.method !== 'GET') return res.status(405).json({ erreur: 'Méthode non autorisée' });
    const { depart, arrivee } = req.query;
    if (!depart || !arrivee) return res.status(400).json({ erreur: 'Ville de départ et arrivée requises' });
    const dep = depart.trim(), arr = arrivee.trim();
    const { data: lignes, error } = await supabase.from('lignes_interurbaines')
      .select('*, agence:agence_id(id, nom, telephone, ville_base, gare_routiere, note_moyenne, nb_avis, verifie)')
      .ilike('ville_depart', `%${dep}%`).ilike('ville_arrivee', `%${arr}%`).eq('actif', true).order('prix_standard', { ascending: true, nullsFirst: false });
    if (error) return res.status(500).json({ erreur: error.message });
    const maintenant = new Date().toISOString();
    const lignesIds = lignes.map(l => l.id);
    let departs = [];
    if (lignesIds.length > 0) {
      const { data: d } = await supabase.from('departs_interurbains').select('*')
        .in('ligne_id', lignesIds).gte('date_heure_depart', maintenant).neq('statut', 'annule').order('date_heure_depart', { ascending: true }).limit(200);
      departs = d ?? [];
    }
    const result = lignes.map(l => ({ ...l, prochains_departs: departs.filter(d => d.ligne_id === l.id).slice(0, 5) }));
    supabase.from('recherches_interurbain').insert([{ ville_depart: dep, ville_arrivee: arr, nb_resultats: result.length }]).then(() => {}).catch(() => {});
    return res.json({ success: true, lignes: result, nb: result.length });
  }

  // ── GET/POST /api/interurbain/agences ─────────────────────────────────────
  if (route === 'agences') {
    if (req.method === 'GET') {
      const { ville } = req.query;
      let query = supabase.from('agences_voyage').select('*').eq('actif', true).order('note_moyenne', { ascending: false });
      if (ville) query = query.ilike('ville_base', `%${ville}%`);
      const { data, error } = await query;
      if (error) return res.status(500).json({ erreur: error.message });
      return res.json({ success: true, agences: data });
    }
    if (req.method === 'POST') {
      const { nom, telephone, ville_base, gare_routiere, user_id } = req.body;
      if (!nom?.trim() || !ville_base?.trim()) return res.status(400).json({ erreur: 'Nom et ville de base requis' });
      const { data: existant } = await supabase.from('agences_voyage').select('id, nom').ilike('nom', nom.trim()).ilike('ville_base', ville_base.trim()).single();
      if (existant) return res.status(409).json({ erreur: 'Cette agence existe déjà', agence: existant });
      const { data, error } = await supabase.from('agences_voyage').insert([{ nom: nom.trim(), telephone: telephone?.trim() || null, ville_base: ville_base.trim(), gare_routiere: gare_routiere?.trim() || null, ajoute_par: UUID_RE.test(user_id) ? user_id : null }]).select().single();
      if (error) return res.status(500).json({ erreur: error.message });
      return res.status(201).json({ success: true, agence: data });
    }
  }

  // ── GET/POST /api/interurbain/lignes ──────────────────────────────────────
  if (route === 'lignes') {
    if (req.method === 'GET') {
      const { agence_id } = req.query;
      if (!UUID_RE.test(agence_id)) return res.status(400).json({ erreur: 'agence_id invalide' });
      const { data, error } = await supabase.from('lignes_interurbaines').select('*').eq('agence_id', agence_id).eq('actif', true).order('ville_depart');
      if (error) return res.status(500).json({ erreur: error.message });
      return res.json({ success: true, lignes: data });
    }
    if (req.method === 'POST') {
      const { agence_id, ville_depart, ville_arrivee, prix_standard, prix_vip, duree_estimee_min, horaires_json, places_totales, user_id } = req.body;
      if (!UUID_RE.test(agence_id) || !ville_depart?.trim() || !ville_arrivee?.trim()) return res.status(400).json({ erreur: 'agence_id, ville_depart et ville_arrivee requis' });
      const { data: existante } = await supabase.from('lignes_interurbaines').select('id').eq('agence_id', agence_id).ilike('ville_depart', ville_depart.trim()).ilike('ville_arrivee', ville_arrivee.trim()).single();
      if (existante) {
        const update = { date_maj: new Date().toISOString() };
        if (prix_standard) update.prix_standard = parseInt(prix_standard);
        if (prix_vip) update.prix_vip = parseInt(prix_vip);
        if (duree_estimee_min) update.duree_estimee_min = parseInt(duree_estimee_min);
        if (horaires_json) update.horaires_json = horaires_json;
        const { data, error } = await supabase.from('lignes_interurbaines').update(update).eq('id', existante.id).select().single();
        if (error) return res.status(500).json({ erreur: error.message });
        return res.json({ success: true, ligne: data, mise_a_jour: true });
      }
      const { data, error } = await supabase.from('lignes_interurbaines').insert([{ agence_id, ville_depart: ville_depart.trim(), ville_arrivee: ville_arrivee.trim(), prix_standard: prix_standard ? parseInt(prix_standard) : null, prix_vip: prix_vip ? parseInt(prix_vip) : null, duree_estimee_min: duree_estimee_min ? parseInt(duree_estimee_min) : null, horaires_json: horaires_json ?? [], places_totales: places_totales ? parseInt(places_totales) : 70, ajoute_par: UUID_RE.test(user_id) ? user_id : null }]).select().single();
      if (error) return res.status(500).json({ erreur: error.message });
      return res.status(201).json({ success: true, ligne: data });
    }
  }

  // ── GET/POST /api/interurbain/departs ─────────────────────────────────────
  if (route === 'departs') {
    if (req.method === 'GET') {
      const { ligne_id } = req.query;
      if (!UUID_RE.test(ligne_id)) return res.status(400).json({ erreur: 'ligne_id invalide' });
      const { data, error } = await supabase.from('departs_interurbains').select('*').eq('ligne_id', ligne_id).gte('date_heure_depart', new Date().toISOString()).neq('statut', 'annule').order('date_heure_depart', { ascending: true }).limit(20);
      if (error) return res.status(500).json({ erreur: error.message });
      return res.json({ success: true, departs: data });
    }
    if (req.method === 'POST') {
      const { ligne_id, date_heure_depart, places_disponibles, user_id } = req.body;
      if (!UUID_RE.test(ligne_id) || !date_heure_depart) return res.status(400).json({ erreur: 'ligne_id et date_heure_depart requis' });
      const heure = new Date(date_heure_depart);
      if (isNaN(heure) || heure < new Date()) return res.status(400).json({ erreur: 'Date de départ invalide ou passée' });
      const { data, error } = await supabase.from('departs_interurbains').insert([{ ligne_id, date_heure_depart: heure.toISOString(), places_disponibles: places_disponibles ? parseInt(places_disponibles) : null, source: 'communaute', signale_par: UUID_RE.test(user_id) ? user_id : null }]).select().single();
      if (error) return res.status(500).json({ erreur: error.message });
      return res.status(201).json({ success: true, depart: data });
    }
  }

  // ── GET/POST /api/interurbain/avis ────────────────────────────────────────
  if (route === 'avis') {
    if (req.method === 'GET') {
      const { agence_id } = req.query;
      if (!UUID_RE.test(agence_id)) return res.status(400).json({ erreur: 'agence_id invalide' });
      const { data, error } = await supabase.from('avis_agences').select('*, utilisateur:user_id(nom)').eq('agence_id', agence_id).order('created_at', { ascending: false }).limit(30);
      if (error) return res.status(500).json({ erreur: error.message });
      return res.json({ success: true, avis: data });
    }
    if (req.method === 'POST') {
      const { agence_id, user_id, note, commentaire } = req.body;
      if (!UUID_RE.test(agence_id) || !UUID_RE.test(user_id)) return res.status(400).json({ erreur: 'agence_id et user_id requis' });
      if (!note || note < 1 || note > 5) return res.status(400).json({ erreur: 'Note entre 1 et 5 requise' });
      const { data, error } = await supabase.from('avis_agences').upsert([{ agence_id, user_id, note: parseInt(note), commentaire: commentaire?.trim() || null }], { onConflict: 'agence_id,user_id' }).select().single();
      if (error) return res.status(500).json({ erreur: error.message });
      const { data: stats } = await supabase.from('avis_agences').select('note').eq('agence_id', agence_id);
      if (stats?.length) {
        const moyenne = Math.round((stats.reduce((s, a) => s + a.note, 0) / stats.length) * 10) / 10;
        await supabase.from('agences_voyage').update({ note_moyenne: moyenne, nb_avis: stats.length }).eq('id', agence_id);
      }
      return res.status(201).json({ success: true, avis: data });
    }
  }

  // ── POST /api/interurbain/signaler-prix ───────────────────────────────────
  if (route === 'signaler-prix') {
    if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });
    const { ligne_id, nouveau_prix, classe = 'standard', user_id } = req.body;
    if (!UUID_RE.test(ligne_id) || !nouveau_prix) return res.status(400).json({ erreur: 'ligne_id et nouveau_prix requis' });
    const { data: ligne } = await supabase.from('lignes_interurbaines').select('prix_standard, prix_vip').eq('id', ligne_id).single();
    const ancien_prix = classe === 'vip' ? ligne?.prix_vip : ligne?.prix_standard;
    const { data, error } = await supabase.from('signalements_prix').insert([{ ligne_id, ancien_prix: ancien_prix || null, nouveau_prix: parseInt(nouveau_prix), classe, signale_par: UUID_RE.test(user_id) ? user_id : null }]).select().single();
    if (error) return res.status(500).json({ erreur: error.message });
    const { data: similaires } = await supabase.from('signalements_prix').select('id').eq('ligne_id', ligne_id).eq('nouveau_prix', parseInt(nouveau_prix)).eq('classe', classe).eq('statut', 'en_attente');
    if (similaires?.length >= 3) {
      const update = classe === 'vip' ? { prix_vip: parseInt(nouveau_prix) } : { prix_standard: parseInt(nouveau_prix) };
      await supabase.from('lignes_interurbaines').update({ ...update, date_maj: new Date().toISOString() }).eq('id', ligne_id);
      await supabase.from('signalements_prix').update({ statut: 'valide' }).eq('ligne_id', ligne_id).eq('nouveau_prix', parseInt(nouveau_prix)).eq('statut', 'en_attente');
    }
    return res.status(201).json({ success: true, signalement: data, message: similaires?.length >= 3 ? 'Prix mis à jour grâce à la communauté !' : `Signalement enregistré (${similaires?.length}/3)` });
  }

  return res.status(404).json({ erreur: 'Route inconnue' });
};
