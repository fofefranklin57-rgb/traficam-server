const supabase = require('../lib/supabase');
const cors     = require('../lib/cors');

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  // GET /api/pub?ecran=home  — pub active pour un écran donné
  if (req.method === 'GET') {
    const { ecran = 'home' } = req.query;
    const aujourd_hui = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('publicites')
      .select('id, partenaire, image_url, lien, description')
      .eq('actif', true)
      .contains('ecrans', [ecran])
      .or(`date_debut.is.null,date_debut.lte.${aujourd_hui}`)
      .or(`date_fin.is.null,date_fin.gte.${aujourd_hui}`)
      .order('priorite', { ascending: false })
      .limit(5);

    if (error) return res.status(500).json({ erreur: error.message });
    return res.json({ success: true, publicites: data ?? [] });
  }

  // POST /api/pub/clic  — enregistre un clic
  if (req.method === 'POST') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ erreur: 'id requis' });

    await supabase.rpc('increment_pub_clic', { pub_id: id }).catch(() =>
      supabase.from('publicites').update({ clics: supabase.raw('clics + 1') }).eq('id', id)
    );
    return res.json({ success: true });
  }

  res.status(405).json({ erreur: 'Méthode non autorisée' });
};
