const supabase = require('../../lib/supabase');
const cors     = require('../../lib/cors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  // GET — avis d'une agence
  if (req.method === 'GET') {
    const { agence_id } = req.query;
    if (!UUID_RE.test(agence_id)) return res.status(400).json({ erreur: 'agence_id invalide' });

    const { data, error } = await supabase
      .from('avis_agences')
      .select('*, utilisateur:user_id(nom)')
      .eq('agence_id', agence_id)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) return res.status(500).json({ erreur: error.message });
    return res.json({ success: true, avis: data });
  }

  // POST — ajouter/mettre à jour un avis
  if (req.method === 'POST') {
    const { agence_id, user_id, note, commentaire } = req.body;

    if (!UUID_RE.test(agence_id) || !UUID_RE.test(user_id)) {
      return res.status(400).json({ erreur: 'agence_id et user_id requis' });
    }
    if (!note || note < 1 || note > 5) {
      return res.status(400).json({ erreur: 'Note entre 1 et 5 requise' });
    }

    // Upsert (1 avis par utilisateur par agence)
    const { data, error } = await supabase
      .from('avis_agences')
      .upsert([{ agence_id, user_id, note: parseInt(note), commentaire: commentaire?.trim() || null }],
              { onConflict: 'agence_id,user_id' })
      .select()
      .single();

    if (error) return res.status(500).json({ erreur: error.message });

    // Recalculer la note moyenne de l'agence
    const { data: stats } = await supabase
      .from('avis_agences')
      .select('note')
      .eq('agence_id', agence_id);

    if (stats?.length) {
      const moyenne = Math.round((stats.reduce((s, a) => s + a.note, 0) / stats.length) * 10) / 10;
      await supabase.from('agences_voyage')
        .update({ note_moyenne: moyenne, nb_avis: stats.length })
        .eq('id', agence_id);
    }

    return res.status(201).json({ success: true, avis: data });
  }

  res.status(405).json({ erreur: 'Méthode non autorisée' });
};
