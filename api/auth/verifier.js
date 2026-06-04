const { supabase } = require('../../lib/supabase');
const { corsHeaders, handleOptions } = require('../../lib/cors');
const { genererToken } = require('../../lib/auth');
const rateLimit = require('../../lib/rateLimit');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  res.set(corsHeaders);

  if (rateLimit(req, res, { max: 10, windowMs: 60 * 1000 })) return;
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });

  const { telephone, code } = req.body;
  if (!telephone || !code) return res.status(400).json({ erreur: 'Téléphone et code requis' });

  const { data: otp } = await supabase
    .from('otp_temp')
    .select('code, expires_at')
    .eq('telephone', telephone)
    .single();

  if (!otp || otp.code !== code || new Date(otp.expires_at) < new Date()) {
    return res.status(401).json({ erreur: 'Code invalide ou expiré' });
  }

  await supabase.from('otp_temp').delete().eq('telephone', telephone);

  let { data: user } = await supabase
    .from('utilisateurs')
    .select('*')
    .eq('telephone', telephone)
    .maybeSingle();

  if (!user) {
    const { data: newUser, error } = await supabase
      .from('utilisateurs')
      .insert({
        telephone,
        role: null,
        plan: 'gratuit',
        signalements: 0,
        confirmations: 0,
        points: 0,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ erreur: error.message });
    user = newUser;
  }

  const token = genererToken(user.id);
  // email_lie indique si l'utilisateur doit encore lier son email
  return res.json({ success: true, utilisateur: user, token, email_lie: !!user.email });
};
