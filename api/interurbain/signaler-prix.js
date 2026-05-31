const supabase = require('../../lib/supabase');
const cors     = require('../../lib/cors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  // POST — signaler un prix incorrect
  if (req.method === 'POST') {
    const { ligne_id, nouveau_prix, classe = 'standard', user_id } = req.body;

    if (!UUID_RE.test(ligne_id) || !nouveau_prix) {
      return res.status(400).json({ erreur: 'ligne_id et nouveau_prix requis' });
    }

    // Récupérer le prix actuel
    const { data: ligne } = await supabase
      .from('lignes_interurbaines')
      .select('prix_standard, prix_vip')
      .eq('id', ligne_id)
      .single();

    const ancien_prix = classe === 'vip' ? ligne?.prix_vip : ligne?.prix_standard;

    const { data, error } = await supabase
      .from('signalements_prix')
      .insert([{
        ligne_id,
        ancien_prix:   ancien_prix || null,
        nouveau_prix:  parseInt(nouveau_prix),
        classe,
        signale_par:   UUID_RE.test(user_id) ? user_id : null,
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ erreur: error.message });

    // Auto-valider si 3 signalements similaires récents (même ligne, même prix)
    const { data: similaires } = await supabase
      .from('signalements_prix')
      .select('id')
      .eq('ligne_id', ligne_id)
      .eq('nouveau_prix', parseInt(nouveau_prix))
      .eq('classe', classe)
      .eq('statut', 'en_attente');

    if (similaires?.length >= 3) {
      // Valider et appliquer
      const update = classe === 'vip'
        ? { prix_vip: parseInt(nouveau_prix) }
        : { prix_standard: parseInt(nouveau_prix) };

      await supabase.from('lignes_interurbaines')
        .update({ ...update, date_maj: new Date().toISOString() })
        .eq('id', ligne_id);

      await supabase.from('signalements_prix')
        .update({ statut: 'valide' })
        .eq('ligne_id', ligne_id)
        .eq('nouveau_prix', parseInt(nouveau_prix))
        .eq('statut', 'en_attente');
    }

    return res.status(201).json({
      success: true,
      signalement: data,
      message: similaires?.length >= 3
        ? 'Prix mis à jour grâce à la communauté !'
        : `Signalement enregistré (${similaires?.length}/3 confirmations pour mise à jour auto)`,
    });
  }

  res.status(405).json({ erreur: 'Méthode non autorisée' });
};
