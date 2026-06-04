const store = new Map();

function rateLimit(req, res, options = {}) {
  const { max = 10, windowMs = 60 * 1000 } = options;
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const key = `${req.url}:${ip}`;
  const now = Date.now();

  const entry = store.get(key) || { count: 0, resetAt: now + windowMs };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }

  entry.count++;
  store.set(key, entry);

  if (entry.count > max) {
    res.status(429).json({ erreur: 'Trop de requêtes. Réessayez dans une minute.' });
    return true;
  }
  return false;
}

module.exports = rateLimit;
