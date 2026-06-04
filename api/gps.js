const { supabase } = require('../../lib/supabase');
const cors = require('../../lib/cors');

function distKm(la1, lo1, la2, lo2) {
  const R = 6371, dLa = (la2-la1)*Math.PI/180, dLo = (lo2-lo1)*Math.PI/180;
  const a = Math.sin(dLa/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function analyserTrafic(latitude, longitude, vitesse) {
  if (vitesse >= 10) return null;
  const { data: positionsLentes } = await supabase.from('positions_gps').select('latitude, longitude')
    .gte('created_at', new Date(Date.now() - 2 * 60000).toISOString()).lte('vitesse', 10);
  const lentesProches = (positionsLentes || []).filter(p => distKm(latitude, longitude, p.latitude, p.longitude) < 0.3);
  if (lentesProches.length < 3) return null;
  const { data: bouchonsProches } = await supabase.from('incidents').select('id, latitude, longitude')
    .eq('statut', 'actif').eq('type', 'bouchon').gte('created_at', new Date(Date.now() - 10 * 60000).toISOString());
  if ((bouchonsProches || []).some(b => distKm(latitude, longitude, b.latitude, b.longitude) < 0.3)) return null;
  const { notifierUsersProches } = require('../../lib/notifier');
  const { data: incident } = await supabase.from('incidents').insert([{
    type: 'bouchon', gravite: 'moyen', lieu: 'Zone détectée automatiquement',
    description: `Bouchon GPS — ${lentesProches.length + 1} véhicules lents`,
    latitude, longitude, source: 'gps',
  }]).select().single();
  if (incident) notifierUsersProches(incident).catch(() => {});
  return incident;
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });

  const { utilisateur_id, latitude, longitude, vitesse = 0 } = req.body;
  if (!latitude || !longitude) return res.status(400).json({ erreur: 'Coordonnées manquantes' });

  await supabase.from('positions_gps').insert([{ utilisateur_id, latitude, longitude, vitesse }]);
  if (utilisateur_id) {
    await supabase.from('utilisateurs').update({ latitude, longitude, derniere_activite: new Date() }).eq('id', utilisateur_id);
  }
  const incidentAuto = await analyserTrafic(latitude, longitude, vitesse);
  return res.json({ success: true, detection_auto: !!incidentAuto, incident: incidentAuto || null });
};
