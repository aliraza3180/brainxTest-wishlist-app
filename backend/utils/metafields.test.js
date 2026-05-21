'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseWishlistJson,
  addUniqueGid,
  removeGid,
  isValidGid,
} = require('./metafields');

const PRODUCT_A = 'gid://shopify/Product/111';
const PRODUCT_B = 'gid://shopify/Product/222';
const CUSTOMER = 'gid://shopify/Customer/999';

describe('parseWishlistJson', () => {
  it('returns [] for null and undefined', () => {
    assert.deepEqual(parseWishlistJson(null), []);
    assert.deepEqual(parseWishlistJson(undefined), []);
  });

  it('returns [] for invalid JSON and non-array values', () => {
    assert.deepEqual(parseWishlistJson('{not json'), []);
    assert.deepEqual(parseWishlistJson('{"foo":"bar"}'), []);
    assert.deepEqual(parseWishlistJson(''), []);
  });

  it('parses a valid JSON array of GID strings', () => {
    const raw = JSON.stringify([PRODUCT_A, PRODUCT_B]);
    assert.deepEqual(parseWishlistJson(raw), [PRODUCT_A, PRODUCT_B]);
  });

  it('filters out non-string entries', () => {
    const raw = JSON.stringify([PRODUCT_A, 42, null, '', PRODUCT_B]);
    assert.deepEqual(parseWishlistJson(raw), [PRODUCT_A, PRODUCT_B]);
  });
});

describe('addUniqueGid', () => {
  it('appends a new GID without mutating the original list', () => {
    const original = [PRODUCT_A];
    const result = addUniqueGid(original, PRODUCT_B);
    assert.deepEqual(result, [PRODUCT_A, PRODUCT_B]);
    assert.deepEqual(original, [PRODUCT_A]);
  });

  it('does not duplicate an existing GID', () => {
    const list = [PRODUCT_A, PRODUCT_B];
    const result = addUniqueGid(list, PRODUCT_A);
    assert.deepEqual(result, [PRODUCT_A, PRODUCT_B]);
    assert.notEqual(result, list);
  });

  it('treats a non-array input as empty', () => {
    assert.deepEqual(addUniqueGid(null, PRODUCT_A), [PRODUCT_A]);
  });
});

describe('removeGid', () => {
  it('removes all matching GIDs without mutating the original', () => {
    const original = [PRODUCT_A, PRODUCT_B, PRODUCT_A];
    const result = removeGid(original, PRODUCT_A);
    assert.deepEqual(result, [PRODUCT_B]);
    assert.deepEqual(original, [PRODUCT_A, PRODUCT_B, PRODUCT_A]);
  });

  it('returns [] when input is not an array', () => {
    assert.deepEqual(removeGid(undefined, PRODUCT_A), []);
  });
});

describe('isValidGid', () => {
  it('accepts valid Customer and Product GIDs', () => {
    assert.equal(isValidGid(CUSTOMER, 'Customer'), true);
    assert.equal(isValidGid(PRODUCT_A, 'Product'), true);
  });

  it('rejects wrong type, malformed GIDs, and non-strings', () => {
    assert.equal(isValidGid(CUSTOMER, 'Product'), false);
    assert.equal(isValidGid('gid://shopify/Product/', 'Product'), false);
    assert.equal(isValidGid('not-a-gid', 'Product'), false);
    assert.equal(isValidGid(null, 'Product'), false);
  });
});
