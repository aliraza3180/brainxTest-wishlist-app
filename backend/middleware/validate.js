'use strict';

const { isValidGid } = require('../utils/metafields');

const GID_PATTERN = /^gid:\/\/shopify\/(Customer|Product)\/\d+$/;

/**
 * Validate customerId query param on GET /api/wishlist.
 */
function validateCustomerQuery(req, res, next) {
  const customerId = req.query.customerId;
  if (!customerId || typeof customerId !== 'string' || !GID_PATTERN.test(customerId)) {
    return res.status(400).json({ success: false, error: 'INVALID_CUSTOMER_ID' });
  }
  if (!isValidGid(customerId, 'Customer')) {
    return res.status(400).json({ success: false, error: 'INVALID_CUSTOMER_ID' });
  }
  return next();
}

/**
 * Validate JSON body { customerId, productId } on write endpoints.
 */
function validateWishlistBody(req, res, next) {
  const { customerId, productId } = req.body || {};

  if (!customerId || typeof customerId !== 'string' || !GID_PATTERN.test(customerId)) {
    return res.status(400).json({ success: false, error: 'INVALID_PAYLOAD', field: 'customerId' });
  }
  if (!isValidGid(customerId, 'Customer')) {
    return res.status(400).json({ success: false, error: 'INVALID_PAYLOAD', field: 'customerId' });
  }
  if (!productId || typeof productId !== 'string' || !GID_PATTERN.test(productId)) {
    return res.status(400).json({ success: false, error: 'INVALID_PAYLOAD', field: 'productId' });
  }
  if (!isValidGid(productId, 'Product')) {
    return res.status(400).json({ success: false, error: 'INVALID_PAYLOAD', field: 'productId' });
  }

  return next();
}

module.exports = { validateCustomerQuery, validateWishlistBody };
