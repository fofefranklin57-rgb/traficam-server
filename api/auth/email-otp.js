const { supabase } = require('../../lib/supabase');
const { corsHeaders, handleOptions } = require('../../lib/cors');
const { Resend } = require('resend');
const { genererToken } = require('../../lib/auth');

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  res.set(corsHeaders);

  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });

  const { email, action } = req.body;
  if (!email) return res.status(400).json({ erreur: 'Email manquant' });

  // ── Envoi OTP ──────────────────────────────────────────────────────────
  if (action === 'envoyer') {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await supabase.from('otp_temp').upsert({
      telephone: email,
      code,
      expires_at,
    });

    await resend.emails.send({
      from: 'TrafiCam <onboarding@resend.dev>',
      to: email,
      subject: `${code} — Votre code TrafiCam`,
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:auto;padding:32px;background:#f9f9f9;border-radius:12px">
          <h2 style="color:#1a7a5e">🚦 TrafiCam</h2>
          <p>Votre code de connexion :</p>
          <div style="font-size:40px;font-weight:800;letter-spacing:8px;color:#111;margin:24px 0">${code}</div>
          <p style="color:#888;font-size:13px">Ce code expire dans 10 minutes.</p>
        </div>
      `,
    });

    return res.json({ success: true });
  }

  // ── Vérification OTP ───────────────────────────────────────────────────
  if (action === 'verifier') {
    const { code } = req.body;
    if (!code) return res.status(400).json({ erreur: 'Code manquant' });

    const { data: otp } = await supabase
      .from('otp_temp')
      .select('*')
      .eq('telephone', email)
      .eq('code', code)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (!otp) return res.status(400).json({ erreur: 'Code invalide ou expiré' });

    await supabase.from('otp_temp').delete().eq('telephone', email);

    // Cherche ou crée l'utilisateur
    let { data: user } = await supabase
      .from('utilisateurs')
      .select('*')
      .eq('telephone', email)
      .maybeSingle();

    if (!user) {
      const { data: newUser, error } = await supabase
        .from('utilisateurs')
        .insert({
          telephone: email,
          nom: email.split('@')[0],
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
    }

    const token = genererToken(user.id);
    return res.json({ success: true, utilisateur: user, token });
  }

  return res.status(400).json({ erreur: 'Action invalide' });
};
