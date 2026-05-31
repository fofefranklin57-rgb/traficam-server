const supabase = require('../../lib/supabase');
const cors = require('../../lib/cors');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });

  const { telephone, code } = req.body;
  if (!telephone || !code) return res.status(400).json({ erreur: 'Téléphone et code requis' });

  const { data: otp } = await supabase
    .from('otp_temp').select('code, expires_at').eq('telephone', telephone).single();

  if (!otp || otp.code !== code || new Date(otp.expires_at) < new Date()) {
    return res.status(401).json({ erreur: 'Code invalide ou expiré' });
  }

  // Supprimer OTP utilisé
  await supabase.from('otp_temp').delete().eq('telephone', telephone);

  // Créer ou récupérer utilisateur
  let { data: user } = await supabase.from('utilisateurs').select('*').eq('telephone', telephone).single();
  if (!user) {
    const { data: newUser } = await supabase.from('utilisateurs').insert([{ telephone }]).select().single();
    user = newUser;
  }

  res.json({ success: true, utilisateur: user });
};
