const supabase = require('../../lib/supabase');
const cors = require('../../lib/cors');
const rateLimit = require('../../lib/rateLimit');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (rateLimit(req, res, { max: 5, windowMs: 60 * 1000 })) return;
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });

  const { telephone } = req.body;
  if (!telephone) return res.status(400).json({ erreur: 'Téléphone requis' });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expires_at = new Date(Date.now() + 5 * 60000).toISOString();

  await supabase.from('otp_temp').upsert([{ telephone, code, expires_at }], { onConflict: 'telephone' });

  // En prod : envoyer SMS via Orange CM API
  // En dev : afficher dans les logs Vercel
  console.log(`OTP ${telephone}: ${code}`);

  res.json({ success: true, message: 'Code envoyé' });
};
