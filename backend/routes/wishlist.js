'use strict';

const express = require('express');
const auth = require('../middleware/auth');
const { validateCustomerQuery, validateWishlistBody } = require('../middleware/validate');
const {
  fetchCustomerWishlist,
  setCustomerWishlist,
  fetchProductsByGids,
  verifyCustomerExists,
} = require('../services/shopify');
const { parseWishlistJson, addUniqueGid, removeGid } = require('../utils/metafields');

const router = express.Router();

function logMutation(payload) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...payload }));
}

router.get('/', validateCustomerQuery, async (req, res, next) => {
  try {
    const { value } = await fetchCustomerWishlist(req.query.customerId);
    const gids = parseWishlistJson(value);
    const products = await fetchProductsByGids(gids);
    res.json({ success: true, products });
  } catch (err) {
    next(err);
  }
});

router.post('/add', auth, validateWishlistBody, async (req, res, next) => {
  const { customerId, productId } = req.body;
  try {
    if (!(await verifyCustomerExists(customerId))) {
      return res.status(404).json({ success: false, error: 'CUSTOMER_NOT_FOUND' });
    }
    const current = await fetchCustomerWishlist(customerId);
    const list = parseWishlistJson(current.value);
    if (list.includes(productId)) {
      logMutation({ customerId, productId, action: 'add', result: 'already_exists' });
      return res.status(409).json({ success: false, error: 'PRODUCT_ALREADY_IN_WISHLIST' });
    }
    const updated = addUniqueGid(list, productId);
    await setCustomerWishlist(customerId, updated, current.compareDigest);
    logMutation({ customerId, productId, action: 'add', result: 'ok' });
    res.json({ success: true, wishlist: updated });
  } catch (err) {
    logMutation({ customerId, productId, action: 'add', result: 'error', detail: err.message });
    next(err);
  }
});

router.delete('/remove', auth, validateWishlistBody, async (req, res, next) => {
  const { customerId, productId } = req.body;
  try {
    if (!(await verifyCustomerExists(customerId))) {
      return res.status(404).json({ success: false, error: 'CUSTOMER_NOT_FOUND' });
    }
    const current = await fetchCustomerWishlist(customerId);
    const list = parseWishlistJson(current.value);
    if (!list.includes(productId)) {
      logMutation({ customerId, productId, action: 'remove', result: 'not_found' });
      return res.status(404).json({ success: false, error: 'PRODUCT_NOT_IN_WISHLIST' });
    }
    const updated = removeGid(list, productId);
    await setCustomerWishlist(customerId, updated, current.compareDigest);
    logMutation({ customerId, productId, action: 'remove', result: 'ok' });
    res.json({ success: true, wishlist: updated });
  } catch (err) {
    logMutation({ customerId, productId, action: 'remove', result: 'error', detail: err.message });
    next(err);
  }
});

module.exports = router;
