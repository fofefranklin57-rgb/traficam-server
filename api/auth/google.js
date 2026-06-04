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
    // Cherche l'utilisateur par google_id ou email
    let { data: user } = await supabase
      .from('utilisateurs')
      .select('*')
      .or(`google_id.eq.${google_id},telephone.eq.${email}`)
      .maybeSingle();

    if (!user) {
      // Nouvel utilisateur — créer le compte
      const { data: newUser, error } = await supabase
        .from('utilisateurs')
        .insert({
          telephone: email,
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
      // Mise à jour infos Google si besoin
      await supabase
        .from('utilisateurs')
        .update({ google_id, nom: nom || user.nom, photo_url: photo || user.photo_url })
        .eq('id', user.id);
      user = { ...user, google_id, nom: nom || user.nom, photo_url: photo || user.photo_url };
    }

    const token = genererToken(user.id);
    return res.json({ success: true, utilisateur: user, token });
  } catch (e) {
    console.error('Erreur auth Google:', e);
    return res.status(500).json({ erreur: e.message });
  }
};
