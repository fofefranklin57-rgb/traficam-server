const { supabase } = require('../../lib/supabase');
const { corsHeaders, handleOptions } = require('../../lib/cors');
const { requireAuth } = require('../../lib/auth');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  res.set(corsHeaders);

  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });

  const userId = requireAuth(req, res);
  if (!userId) return;

  const { email, action, code } = req.body;
  if (!email) return res.status(400).json({ erreur: 'Email manquant' });

  // ── Étape 1 : envoyer OTP à l'email ────────────────────────────────────
  if (action === 'envoyer') {
    // Vérifie que cet email n'est pas déjà pris par un autre compte
    const { data: existe } = await supabase
      .from('utilisateurs')
      .select('id')
      .eq('email', email)
      .neq('id', userId)
      .maybeSingle();

    if (existe) return res.status(409).json({ erreur: 'Cet email est déjà utilisé par un autre compte' });

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await supabase.from('otp_temp').upsert({ telephone: `email_lier_${userId}`, code: otpCode, expires_at });

    await resend.emails.send({
      from: 'TrafiCam <onboarding@resend.dev>',
      to: email,
      subject: `${otpCode} — Confirmez votre email TrafiCam`,
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:auto;padding:32px;background:#f9f9f9;border-radius:12px">
          <h2 style="color:#1a7a5e">🚦 TrafiCam</h2>
          <p>Confirmez votre adresse email avec ce code :</p>
          <div style="font-size:40px;font-weight:800;letter-spacing:8px;color:#111;margin:24px 0">${otpCode}</div>
          <p style="color:#888;font-size:13px">Ce code expire dans 10 minutes.</p>
        </div>
      `,
    });

    return res.json({ success: true });
  }

  // ── Étape 2 : vérifier OTP et lier l'email ─────────────────────────────
  if (action === 'verifier') {
    if (!code) return res.status(400).json({ erreur: 'Code manquant' });

    const { data: otp } = await supabase
      .from('otp_temp')
      .select('*')
      .eq('telephone', `email_lier_${userId}`)
      .eq('code', code)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (!otp) return res.status(400).json({ erreur: 'Code invalide ou expiré' });

    await supabase.from('otp_temp').delete().eq('telephone', `email_lier_${userId}`);

    // Vérifie une dernière fois qu'aucun autre compte n'a pris cet email entre temps
    const { data: doublon } = await supabase
      .from('utilisateurs')
      .select('id, telephone, signalements, confirmations, points')
      .eq('email', email)
      .neq('id', userId)
      .maybeSingle();

    if (doublon) {
      // Fusionne le compte email existant dans le compte téléphone courant
      const { data: compteActuel } = await supabase
        .from('utilisateurs')
        .select('signalements, confirmations, points, google_id, photo_url')
        .eq('id', userId)
        .single();

      await supabase.from('utilisateurs').update({
        email,
        google_id: compteActuel.google_id || doublon.google_id || null,
        points: (compteActuel.points || 0) + (doublon.points || 0),
        signalements: (compteActuel.signalements || 0) + (doublon.signalements || 0),
        confirmations: (compteActuel.confirmations || 0) + (doublon.confirmations || 0),
      }).eq('id', userId);

      await supabase.from('utilisateurs').delete().eq('id', doublon.id);

      return res.json({ success: true, fusion: true });
    }

    // Pas de doublon — liaison simple
    const { error } = await supabase
      .from('utilisateurs')
      .update({ email })
      .eq('id', userId);

    if (error) return res.status(500).json({ erreur: error.message });

    return res.json({ success: true, fusion: false });
  }

  return res.status(400).json({ erreur: 'Action invalide. Utilisez "envoyer" ou "verifier"' });
};
