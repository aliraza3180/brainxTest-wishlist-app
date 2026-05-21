'use strict';

/**
 * Pure helpers for working with the wishlist customer metafield value.
 *
 * The metafield is stored as type `list.product_reference`, which on the wire
 * is a JSON-stringified array of product GIDs:
 *   '["gid://shopify/Product/123","gid://shopify/Product/456"]'
 *
 * These functions never read env vars, never touch the network, and never
 * mutate their inputs. They are safe to import directly into unit tests.
 */

const GID_REGEX = /^gid:\/\/shopify\/([A-Za-z][A-Za-z0-9]*)\/\d+$/;

/**
 * Safely parse a metafield value into an array of GID strings. Returns an
 * empty array for null, undefined, malformed JSON, or non-array values.
 */
function parseWishlistJson(jsonString) {
  if (jsonString == null) return [];
  if (typeof jsonString !== 'string' || jsonString.length === 0) return [];
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (_err) {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((g) => typeof g === 'string' && g.length > 0);
}

/**
 * Return a new array with `gid` appended if not already present. Inputs are
 * not mutated. A non-array `list` is treated as empty.
 */
function addUniqueGid(list, gid) {
  const base = Array.isArray(list) ? list : [];
  if (base.includes(gid)) return base.slice();
  return base.concat([gid]);
}

/**
 * Return a new array with all occurrences of `gid` removed. Inputs are not
 * mutated. A non-array `list` returns an empty array.
 */
function removeGid(list, gid) {
  if (!Array.isArray(list)) return [];
  return list.filter((g) => g !== gid);
}

/**
 * Test whether `gid` is a syntactically valid Shopify GID of the expected
 * resource type, e.g. isValidGid('gid://shopify/Product/123', 'Product').
 */
function isValidGid(gid, type) {
  if (typeof gid !== 'string' || typeof type !== 'string') return false;
  const match = gid.match(GID_REGEX);
  if (!match) return false;
  return match[1] === type;
}

module.exports = {
  parseWishlistJson,
  addUniqueGid,
  removeGid,
  isValidGid,
};
