'use strict';

/**
 * Phase 2 smoke test for the Shopify integration layer.
 *
 * Run from the backend/ directory after copying .env.example to .env:
 *   node scripts/smoke-test.js <customerGid> [<productGid>]
 *
 * Example:
 *   node scripts/smoke-test.js gid://shopify/Customer/1234567890 gid://shopify/Product/9876543210
 *
 * This script is intentionally throwaway — it proves end-to-end that the
 * service layer talks to the live Shopify Admin API correctly before any
 * HTTP routes exist on top of it. If a productGid is supplied, the script
 * also exercises a full add -> read -> remove round trip against the real
 * metafield so you can confirm the CAS digest dance works.
 */

require('dotenv').config();

const path = require('node:path');
const {
  fetchCustomerWishlist,
  setCustomerWishlist,
  fetchProductsByGids,
  verifyCustomerExists,
  ShopifyNotFoundError,
  ShopifyGraphQLError,
} = require(path.join('..', 'services', 'shopify'));

const {
  parseWishlistJson,
  addUniqueGid,
  removeGid,
  isValidGid,
} = require(path.join('..', 'utils', 'metafields'));

function out(label, value) {
  console.log(`\n— ${label} —`);
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

async function main() {
  const [, , customerGid, productGid] = process.argv;

  if (!customerGid) {
    console.error('Usage: node scripts/smoke-test.js <customerGid> [<productGid>]');
    process.exit(2);
  }

  if (!isValidGid(customerGid, 'Customer')) {
    console.error(`Invalid customer GID: ${customerGid}`);
    process.exit(2);
  }
  if (productGid && !isValidGid(productGid, 'Product')) {
    console.error(`Invalid product GID: ${productGid}`);
    process.exit(2);
  }

  out('Step 1 — verifyCustomerExists', await verifyCustomerExists(customerGid));

  const initial = await fetchCustomerWishlist(customerGid);
  out('Step 2 — fetchCustomerWishlist (raw)', initial);
  const parsed = parseWishlistJson(initial.value);
  out('Step 2b — parsed wishlist', parsed);

  if (!productGid) {
    console.log('\n(no productGid supplied — skipping write round-trip)');
    if (parsed.length > 0) {
      out('Step 3 — fetchProductsByGids', await fetchProductsByGids(parsed));
    }
    return;
  }

  const next = addUniqueGid(parsed, productGid);
  const newDigest = await setCustomerWishlist(customerGid, next, initial.compareDigest);
  out('Step 3 — setCustomerWishlist (added) -> new digest', newDigest);

  const afterAdd = await fetchCustomerWishlist(customerGid);
  out('Step 4 — fetchCustomerWishlist (after add)', afterAdd);

  out('Step 5 — fetchProductsByGids', await fetchProductsByGids(parseWishlistJson(afterAdd.value)));

  const pruned = removeGid(parseWishlistJson(afterAdd.value), productGid);
  const finalDigest = await setCustomerWishlist(customerGid, pruned, afterAdd.compareDigest);
  out('Step 6 — setCustomerWishlist (removed) -> new digest', finalDigest);

  const afterRemove = await fetchCustomerWishlist(customerGid);
  out('Step 7 — fetchCustomerWishlist (after remove)', afterRemove);

  console.log('\nSmoke test complete.');
}

main().catch((err) => {
  if (err instanceof ShopifyNotFoundError) {
    console.error('NOT FOUND:', err.message, err.details);
    process.exit(4);
  }
  if (err instanceof ShopifyGraphQLError) {
    console.error('GraphQL error:', err.message);
    console.error(JSON.stringify(err.userErrors, null, 2));
    process.exit(5);
  }
  console.error('SMOKE TEST FAILED:', err && err.stack ? err.stack : err);
  process.exit(1);
});
