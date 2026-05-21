'use strict';

const crypto = require('node:crypto');

const WISHLIST_API_SECRET = process.env.WISHLIST_API_SECRET;

if (!WISHLIST_API_SECRET) {
  throw new Error('Missing required env var: WISHLIST_API_SECRET');
}

/**
 * Verify the shared secret on write endpoints.
 * Uses timing-safe comparison to reduce timing-attack surface.
 */
function auth(req, res, next) {
  const provided = req.get('X-Wishlist-Secret');
  if (!provided || typeof provided !== 'string') {
    return res.status(401).json({ success: false, error: 'INVALID_SECRET' });
  }

  const expected = Buffer.from(WISHLIST_API_SECRET, 'utf8');
  const actual = Buffer.from(provided, 'utf8');

  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return res.status(401).json({ success: false, error: 'INVALID_SECRET' });
  }

  return next();
}

module.exports = auth;
