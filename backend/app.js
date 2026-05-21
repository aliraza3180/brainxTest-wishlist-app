'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const logger = require('./middleware/logger');
const rateLimiter = require('./middleware/rateLimit');
const errorHandler = require('./middleware/errorHandler');
const wishlistRoutes = require('./routes/wishlist');

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const PORT = Number(process.env.PORT) || 3000;

if (!SHOPIFY_STORE_DOMAIN) {
  throw new Error('Missing required env var: SHOPIFY_STORE_DOMAIN');
}

const allowedOrigins = [
  `https://${SHOPIFY_STORE_DOMAIN}`,
  `https://www.${SHOPIFY_STORE_DOMAIN}`,
];

const app = express();

app.set('trust proxy', 1);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'X-Wishlist-Secret'],
  })
);

app.use(express.json());
app.use(logger);
app.use('/api', rateLimiter);

app.get('/', (_req, res) => {
  res.json({
    name: 'BrainX Wishlist API',
    status: 'running',
    health: '/health',
    endpoints: {
      getWishlist: 'GET /api/wishlist?customerId=gid://shopify/Customer/{id}',
      add: 'POST /api/wishlist/add — body: { customerId, productId }',
      remove: 'DELETE /api/wishlist/remove — body: { customerId, productId }',
    },
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/wishlist', wishlistRoutes);

app.use(errorHandler);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(
      JSON.stringify({
        level: 'info',
        ts: new Date().toISOString(),
        msg: 'server_started',
        port: PORT,
      })
    );
  });
}

module.exports = app;
