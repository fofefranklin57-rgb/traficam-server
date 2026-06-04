const supabase = require('../lib/supabase');
const cors = require('../lib/cors');
const { genererToken, requireAuth } = require('../lib/auth');
const rateLimit = require('../lib/rateLimit');
const { Resend } = require('resend');

const resend   = new Resend(process.env.RESEND_API_KEY);
const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
const ROLES_VALIDES = ['client', 'taximan', 'moto', 'personnel', 'transporteur'];

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  const _seg = req.url.split('?')[0].split('/').filter(Boolean); const route = _seg[_seg.length - 1] === 'auth' ? null : _seg.find((s, i) => _seg[i-1] === 'auth');

  // ── POST /api/auth/otp ────────────────────────────────────────────────────
  if (route === 'otp') {
    if (rateLimit(req, res, { max: 5, windowMs: 60 * 1000 })) return;
    if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });
    const { telephone } = req.body;
    if (!telephone) return res.status(400).json({ erreur: 'Téléphone requis' });
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires_at = new Date(Date.now() + 5 * 60000).toISOString();
    await supabase.from('otp_temp').upsert([{ telephone, code, expires_at }], { onConflict: 'telephone' });
    console.log(`OTP ${telephone}: ${code}`);
    return res.json({ success: true, message: 'Code envoyé' });
  }

  // ── POST /api/auth/verifier ───────────────────────────────────────────────
  if (route === 'verifier') {
    if (rateLimit(req, res, { max: 10, windowMs: 60 * 1000 })) return;
    if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });
    const { telephone, code } = req.body;
    if (!telephone || !code) return res.status(400).json({ erreur: 'Téléphone et code requis' });
    const { data: otp } = await supabase.from('otp_temp').select('code, expires_at').eq('telephone', telephone).single();
    if (!otp || otp.code !== code || new Date(otp.expires_at) < new Date()) {
      return res.status(401).json({ erreur: 'Code invalide ou expiré' });
    }
    await supabase.from('otp_temp').delete().eq('telephone', telephone);
    let { data: user } = await supabase.from('utilisateurs').select('*').eq('telephone', telephone).maybeSingle();
    if (!user) {
      const { data: newUser, error } = await supabase.from('utilisateurs').insert([{
        telephone, role: null, plan: 'gratuit', signalements: 0, confirmations: 0, points: 0,
      }]).select().single();
      if (error) return res.status(500).json({ erreur: error.message });
      user = newUser;
    }
    const token = genererToken(user.id);
    return res.json({ success: true, utilisateur: user, token, email_lie: !!user.email });
  }

  // ── POST /api/auth/google ─────────────────────────────────────────────────
  if (route === 'google') {
    if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });
    const { google_id, email, nom, photo } = req.body;
    if (!google_id || !email) return res.status(400).json({ erreur: 'Données manquantes' });
    try {
      let { data: user } = await supabase.from('utilisateurs').select('*')
        .or(`google_id.eq.${google_id},email.eq.${email}`).maybeSingle();
      if (!user) {
        const { data: newUser, error } = await supabase.from('utilisateurs').insert({
          email, google_id, nom: nom || email.split('@')[0], photo_url: photo || null,
          role: null, plan: 'gratuit', signalements: 0, confirmations: 0, points: 0,
        }).select().single();
        if (error) throw error;
        user = newUser;
      } else {
        const updates = { google_id, photo_url: photo || user.photo_url };
        if (!user.email) updates.email = email;
        if (!user.nom || user.nom === user.telephone) updates.nom = nom || user.nom;
        await supabase.from('utilisateurs').update(updates).eq('id', user.id);
        user = { ...user, ...updates };
      }
      const token = genererToken(user.id);
      return res.json({ success: true, utilisateur: user, token });
    } catch (e) {
      return res.status(500).json({ erreur: e.message });
    }
  }

  // ── POST /api/auth/email-otp ──────────────────────────────────────────────
  if (route === 'email-otp') {
    if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });
    const { email, action, code } = req.body;
    if (!email) return res.status(400).json({ erreur: 'Email manquant' });
    if (action === 'envoyer') {
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await supabase.from('otp_temp').upsert({ telephone: email, code: otpCode, expires_at });
      await resend.emails.send({
        from: 'TrafiCam <onboarding@resend.dev>', to: email,
        subject: `${otpCode} — Votre code TrafiCam`,
        html: `<div style="font-family:sans-serif;max-width:400px;margin:auto;padding:32px;background:#f9f9f9;border-radius:12px"><h2 style="color:#1a7a5e">🚦 TrafiCam</h2><p>Votre code :</p><div style="font-size:40px;font-weight:800;color:#111;margin:24px 0">${otpCode}</div><p style="color:#888;font-size:13px">Expire dans 10 minutes.</p></div>`,
      });
      return res.json({ success: true });
    }
    if (action === 'verifier') {
      if (!code) return res.status(400).json({ erreur: 'Code manquant' });
      const { data: otp } = await supabase.from('otp_temp').select('*')
        .eq('telephone', email).eq('code', code).gt('expires_at', new Date().toISOString()).maybeSingle();
      if (!otp) return res.status(400).json({ erreur: 'Code invalide ou expiré' });
      await supabase.from('otp_temp').delete().eq('telephone', email);
      let { data: user } = await supabase.from('utilisateurs').select('*').eq('email', email).maybeSingle();
      if (!user) {
        const { data: newUser, error } = await supabase.from('utilisateurs').insert({
          email, nom: email.split('@')[0], role: null, plan: 'gratuit', signalements: 0, confirmations: 0, points: 0,
        }).select().single();
        if (error) throw error;
        user = newUser;
      }
      const token = genererToken(user.id);
      return res.json({ success: true, utilisateur: user, token });
    }
    return res.status(400).json({ erreur: 'Action invalide' });
  }

  // ── PUT /api/auth/profil ──────────────────────────────────────────────────
  if (route === 'profil') {
    if (req.method !== 'PUT') return res.status(405).json({ erreur: 'Méthode non autorisée' });
    const { user_id, role, type_vehicule, nom, telephone } = req.body;
    if (!UUID_RE.test(user_id)) return res.status(400).json({ erreur: 'user_id invalide' });
    const update = {};
    if (role) {
      if (!ROLES_VALIDES.includes(role)) return res.status(400).json({ erreur: 'Rôle invalide' });
      update.role = role;
      if (type_vehicule) update.type_vehicule = type_vehicule;
    }
    if (nom)       update.nom       = nom;
    if (telephone) update.telephone = telephone;
    if (Object.keys(update).length === 0) return res.status(400).json({ erreur: 'Aucun champ à mettre à jour' });
    const { data: user, error } = await supabase.from('utilisateurs').update(update).eq('id', user_id).select().single();
    if (error) return res.status(500).json({ erreur: error.message });
    return res.json({ success: true, utilisateur: user });
  }

  // ── POST /api/auth/push-token ─────────────────────────────────────────────
  if (route === 'push-token') {
    if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });
    const { utilisateur_id, push_token } = req.body;
    if (!push_token) return res.status(400).json({ erreur: 'Token manquant' });
    if (UUID_RE.test(utilisateur_id)) {
      await supabase.from('utilisateurs').update({ push_token }).eq('id', utilisateur_id);
      const { data: user } = await supabase.from('utilisateurs').select('nom, telephone').eq('id', utilisateur_id).single();
      if (user && push_token.startsWith('ExponentPushToken')) {
        const conditions = [];
        if (user.telephone) conditions.push(`telephone_sur_objet.eq.${user.telephone}`);
        if (user.nom)       conditions.push(`nom_sur_objet.ilike.%${user.nom}%`);
        if (conditions.length > 0) {
          const { data: objets } = await supabase.from('objets_trouves').select('id, type_objet, lieu_depot')
            .or(conditions.join(',')).eq('statut', 'disponible').limit(3);
          if (objets?.length > 0) {
            await supabase.from('objets_trouves').update({ statut: 'notifie', notifie_user_id: utilisateur_id }).in('id', objets.map(o => o.id));
            await fetch(EXPO_URL, {
              method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify([{ to: push_token, title: `📦 ${objets.length > 1 ? `${objets.length} objets trouvés` : 'Un objet trouvé'} à votre nom !`,
                body: `Déposé à : ${objets[0].lieu_depot}. Ouvrez TrafiCam → Objets Trouvés.`, sound: 'default', priority: 'high', data: { type: 'objets_trouves' } }]),
            });
          }
        }
      }
    }
    return res.json({ success: true });
  }

  // ── POST /api/auth/lier-email ─────────────────────────────────────────────
  if (route === 'lier-email') {
    if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { email, action, code } = req.body;
    if (!email) return res.status(400).json({ erreur: 'Email manquant' });
    if (action === 'envoyer') {
      const { data: existe } = await supabase.from('utilisateurs').select('id').eq('email', email).neq('id', userId).maybeSingle();
      if (existe) return res.status(409).json({ erreur: 'Cet email est déjà utilisé par un autre compte' });
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await supabase.from('otp_temp').upsert({ telephone: `email_lier_${userId}`, code: otpCode, expires_at });
      await resend.emails.send({
        from: 'TrafiCam <onboarding@resend.dev>', to: email,
        subject: `${otpCode} — Confirmez votre email TrafiCam`,
        html: `<div style="font-family:sans-serif;max-width:400px;margin:auto;padding:32px;background:#f9f9f9;border-radius:12px"><h2 style="color:#1a7a5e">🚦 TrafiCam</h2><p>Confirmez votre email :</p><div style="font-size:40px;font-weight:800;color:#111;margin:24px 0">${otpCode}</div><p style="color:#888;font-size:13px">Expire dans 10 minutes.</p></div>`,
      });
      return res.json({ success: true });
    }
    if (action === 'verifier') {
      if (!code) return res.status(400).json({ erreur: 'Code manquant' });
      const { data: otp } = await supabase.from('otp_temp').select('*')
        .eq('telephone', `email_lier_${userId}`).eq('code', code).gt('expires_at', new Date().toISOString()).maybeSingle();
      if (!otp) return res.status(400).json({ erreur: 'Code invalide ou expiré' });
      await supabase.from('otp_temp').delete().eq('telephone', `email_lier_${userId}`);
      const { data: doublon } = await supabase.from('utilisateurs')
        .select('id, signalements, confirmations, points, google_id').eq('email', email).neq('id', userId).maybeSingle();
      if (doublon) {
        const { data: cur } = await supabase.from('utilisateurs').select('signalements, confirmations, points, google_id').eq('id', userId).single();
        await supabase.from('utilisateurs').update({
          email,
          google_id: cur.google_id || doublon.google_id || null,
          points: (cur.points || 0) + (doublon.points || 0),
          signalements: (cur.signalements || 0) + (doublon.signalements || 0),
          confirmations: (cur.confirmations || 0) + (doublon.confirmations || 0),
        }).eq('id', userId);
        await supabase.from('utilisateurs').delete().eq('id', doublon.id);
        return res.json({ success: true, fusion: true });
      }
      const { error } = await supabase.from('utilisateurs').update({ email }).eq('id', userId);
      if (error) return res.status(500).json({ erreur: error.message });
      return res.json({ success: true, fusion: false });
    }
    return res.status(400).json({ erreur: 'Action invalide' });
  }

  return res.status(404).json({ erreur: 'Route inconnue' });
};
