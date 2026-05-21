'use strict';

const {
  ShopifyAuthError,
  ShopifyNotFoundError,
  ShopifyRateLimitError,
  ShopifyGraphQLError,
} = require('../services/shopify');

function formatGraphqlDetail(err) {
  if (err.userErrors && err.userErrors.length > 0) {
    return err.userErrors.map((e) => e.message || String(e)).join('; ');
  }
  return err.message || 'Unknown Shopify error';
}

function hasStaleObjectError(err) {
  return (
    err instanceof ShopifyGraphQLError &&
    err.userErrors.some((e) => e.code === 'STALE_OBJECT')
  );
}

/**
 * Map typed Shopify errors (and unexpected failures) to HTTP responses.
 */
function errorHandler(err, _req, res, _next) {
  if (err instanceof ShopifyNotFoundError) {
    return res.status(404).json({ success: false, error: 'CUSTOMER_NOT_FOUND' });
  }

  if (err instanceof ShopifyAuthError) {
    return res.status(500).json({
      success: false,
      error: 'SHOPIFY_API_ERROR',
      detail: 'Shopify authentication failed — check SHOPIFY_ADMIN_ACCESS_TOKEN',
    });
  }

  if (err instanceof ShopifyRateLimitError) {
    return res.status(429).json({ success: false, error: 'RATE_LIMITED' });
  }

  if (hasStaleObjectError(err)) {
    return res.status(409).json({
      success: false,
      error: 'WISHLIST_CONFLICT',
      detail: 'Wishlist was modified concurrently; retry the request',
    });
  }

  if (err instanceof ShopifyGraphQLError) {
    return res.status(500).json({
      success: false,
      error: 'SHOPIFY_API_ERROR',
      detail: formatGraphqlDetail(err),
    });
  }

  console.log(
    JSON.stringify({
      level: 'error',
      ts: new Date().toISOString(),
      msg: 'unhandled_error',
      error: err && err.message ? err.message : String(err),
    })
  );

  return res.status(500).json({
    success: false,
    error: 'SHOPIFY_API_ERROR',
    detail: err && err.message ? err.message : 'Internal server error',
  });
}

module.exports = errorHandler;
