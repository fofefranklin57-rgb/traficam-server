const { supabase } = require('../../lib/supabase');
const { corsHeaders, handleOptions } = require('../../lib/cors');
const { genererToken } = require('../../lib/auth');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  res.set(corsHeaders);

  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });

  const { google_id, email, nom, photo } = req.body;
  if (!google_id || !email) return res.status(400).json({ erreur: 'Données manquantes' });

  try {
    // Cherche par google_id OU email — évite les doublons inter-méthodes
    let { data: user } = await supabase
      .from('utilisateurs')
      .select('*')
      .or(`google_id.eq.${google_id},email.eq.${email}`)
      .maybeSingle();

    if (!user) {
      const { data: newUser, error } = await supabase
        .from('utilisateurs')
        .insert({
          email,
          google_id,
          nom: nom || email.split('@')[0],
          photo_url: photo || null,
          role: null,
          plan: 'gratuit',
          signalements: 0,
          confirmations: 0,
          points: 0,
        })
        .select()
        .single();

      if (error) throw error;
      user = newUser;
    } else {
      // Enrichit le compte existant avec google_id et photo
      const updates = { google_id, photo_url: photo || user.photo_url };
      if (!user.email) updates.email = email;
      if (!user.nom || user.nom === user.telephone) updates.nom = nom || user.nom;

      await supabase.from('utilisateurs').update(updates).eq('id', user.id);
      user = { ...user, ...updates };
    }

    const token = genererToken(user.id);
    return res.json({ success: true, utilisateur: user, token });
  } catch (e) {
    console.error('Erreur auth Google:', e);
    return res.status(500).json({ erreur: e.message });
  }
};
