const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'traficam_secret_2024';

function genererToken(userId) {
  return jwt.sign({ id: userId }, SECRET, { expiresIn: '90d' });
}

function verifierToken(req) {
  const header = req.headers['authorization'] || '';
  const token = header.replace('Bearer ', '').trim();
  if (!token) return null;
  try {
    return jwt.verify(token, SECRET);
  } catch (_) {
    return null;
  }
}

function requireAuth(req, res) {
  const payload = verifierToken(req);
  if (!payload) {
    res.status(401).json({ erreur: 'Non autorisé — token manquant ou invalide' });
    return null;
  }
  return payload;
}

module.exports = { genererToken, verifierToken, requireAuth };
