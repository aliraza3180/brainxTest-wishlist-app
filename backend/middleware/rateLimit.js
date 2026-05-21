'use strict';

const rateLimit = require('express-rate-limit');

/**
 * 30 requests per minute per IP (in-memory; per Vercel instance in production).
 */
const rateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req, res) {
    res.status(429).json({ success: false, error: 'RATE_LIMITED' });
  },
});

module.exports = rateLimiter;
