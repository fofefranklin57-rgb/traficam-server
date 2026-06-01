const supabase = require('./supabase');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function distKm(la1, lo1, la2, lo2) {
  const R = 6371, dLa = (la2-la1)*Math.PI/180, dLo = (lo2-lo1)*Math.PI/180;
  const a = Math.sin(dLa/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const MESSAGES = {
  accident:      { titre: '🚨 Accident signalé',      rayon: 2 },
  bouchon:       { titre: '🚦 Embouteillage détecté',  rayon: 3 },
  route_bloquee: { titre: '🚧 Route bloquée',          rayon: 5 },
  chantier:      { titre: '🏗️ Chantier en cours',      rayon: 2 },
  nid_de_poule:  { titre: '🕳️ Nid-de-poule signalé',   rayon: 1 },
};

async function notifierUsersProches(incident) {
  try {
    const { data: users } = await supabase
      .from('utilisateurs')
      .select('push_token, latitude, longitude')
      .not('push_token', 'is', null);

    if (!users || users.length === 0) return 0;

    const cfg    = MESSAGES[incident.type] ?? { titre: '⚠️ Incident signalé', rayon: 2 };
    const titre  = cfg.titre;
    const rayon  = cfg.rayon;
    const corps  = `${incident.lieu} — ${(incident.description || '').slice(0, 80)}`;

    const messages = users
      .filter(u =>
        u.latitude && u.longitude &&
        u.push_token.startsWith('ExponentPushToken') &&
        distKm(incident.latitude, incident.longitude, u.latitude, u.longitude) <= rayon
      )
      .map(u => ({
        to: u.push_token,
        title: titre,
        body: corps,
        sound: 'default',
        badge: 1,
        data: {
          incidentId: incident.id,
          type: incident.type,
          lat: incident.latitude,
          lng: incident.longitude,
        },
        priority: 'high',
        channelId: 'traficam',
      }));

    if (messages.length === 0) return 0;

    for (let i = 0; i < messages.length; i += 100) {
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages.slice(i, i + 100)),
      });
    }

    return messages.length;
  } catch (e) {
    console.error('notifier error:', e.message);
    return 0;
  }
}

// Cherche le propriétaire d'un objet par nom/téléphone et lui envoie une notif ciblée
async function rechercherEtNotifierProprietaire(nomSurObjet, telephoneSurObjet, objetId) {
  try {
    let user = null;

    if (telephoneSurObjet) {
      const tel = telephoneSurObjet.replace(/\s/g, '');
      const { data } = await supabase
        .from('utilisateurs')
        .select('id, push_token')
        .eq('telephone', tel)
        .single();
      user = data;
    }

    if (!user && nomSurObjet && nomSurObjet.trim().length > 2) {
      const { data } = await supabase
        .from('utilisateurs')
        .select('id, push_token')
        .ilike('nom', `%${nomSurObjet.trim()}%`)
        .limit(1)
        .single();
      user = data;
    }

    if (!user?.push_token?.startsWith('ExponentPushToken')) return null;

    await supabase.from('objets_trouves')
      .update({ statut: 'notifie', notifie_user_id: user.id })
      .eq('id', objetId);

    await fetch(EXPO_PUSH_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify([{
        to:       user.push_token,
        title:    '📦 Un objet à votre nom a été trouvé !',
        body:     'Quelqu\'un a trouvé un objet qui pourrait vous appartenir. Consultez TrafiCam pour savoir où le récupérer.',
        sound:    'default',
        priority: 'high',
        data:     { type: 'objet_trouve', objetId },
      }]),
    });

    return user.id;
  } catch {
    return null;
  }
}

module.exports = { notifierUsersProches, rechercherEtNotifierProprietaire };
