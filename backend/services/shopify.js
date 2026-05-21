'use strict';

/**
 * Thin Admin GraphQL client for the wishlist backend.
 *
 * Responsibilities:
 *   1. Hold the four named GraphQL operations the app uses (validated against
 *      the live 2025-01 schema via Shopify Dev MCP `validate_graphql_codeblocks`).
 *   2. Provide a single retrying transport (`shopifyGraphQL`) that:
 *        - reads credentials from env at module-load and fails fast if missing
 *        - inspects `X-Shopify-Shop-Api-Call-Limit` and warns at >= 80% usage
 *        - retries 5xx / 429 responses with exponential backoff
 *        - maps Shopify failure modes to four typed error classes so the
 *          Express error handler can translate them into HTTP status codes.
 *   3. Expose four high-level operations: read/write the wishlist metafield,
 *      hydrate product cards, and verify a customer exists.
 *
 * Note on `Product.featuredImage`: the field is marked deprecated in 2025-01
 * in favour of `featuredMedia`, but `featuredImage` only requires the
 * `read_products` scope while `featuredMedia` pulls in `read_files` and
 * several others. We intentionally use the deprecated field to keep the
 * scope footprint at exactly the three scopes the task brief lists.
 */

class ShopifyAuthError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ShopifyAuthError';
    this.details = details || null;
  }
}

class ShopifyNotFoundError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ShopifyNotFoundError';
    this.details = details || null;
  }
}

class ShopifyRateLimitError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ShopifyRateLimitError';
    this.details = details || null;
  }
}

class ShopifyGraphQLError extends Error {
  constructor(message, userErrors) {
    super(message);
    this.name = 'ShopifyGraphQLError';
    this.userErrors = Array.isArray(userErrors) ? userErrors : [];
  }
}

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION;

if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_ACCESS_TOKEN || !SHOPIFY_API_VERSION) {
  throw new Error(
    'Missing required Shopify env vars: SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_API_VERSION'
  );
}

const ENDPOINT = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 500;
const METAFIELD_NAMESPACE = 'custom';
const METAFIELD_KEY = 'wishlist';
const METAFIELD_TYPE = 'list.product_reference';

function logJson(level, payload) {
  console.log(JSON.stringify({ level, ts: new Date().toISOString(), ...payload }));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shopifyGraphQL(query, variables, operationName) {
  let lastError;

  for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
    const requestStart = Date.now();
    let response;

    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ADMIN_ACCESS_TOKEN,
        },
        body: JSON.stringify({ query, variables: variables || {}, operationName }),
      });
    } catch (networkErr) {
      lastError = networkErr;
      if (attempt < RETRY_MAX_ATTEMPTS) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
        logJson('warn', {
          msg: 'shopify_network_error_retry',
          operationName,
          attempt,
          delay_ms: delay,
          error: String(networkErr && networkErr.message ? networkErr.message : networkErr),
        });
        await sleep(delay);
        continue;
      }
      throw networkErr;
    }

    const callLimit = response.headers.get('X-Shopify-Shop-Api-Call-Limit');
    if (callLimit) {
      const [usedStr, maxStr] = callLimit.split('/');
      const used = Number(usedStr);
      const max = Number(maxStr);
      if (Number.isFinite(used) && Number.isFinite(max) && max > 0 && used / max >= 0.8) {
        logJson('warn', {
          msg: 'shopify_rate_limit_warning',
          operationName,
          used,
          max,
        });
      }
    }

    if (response.status >= 500 || response.status === 429) {
      if (attempt < RETRY_MAX_ATTEMPTS) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
        logJson('warn', {
          msg: 'shopify_transient_retry',
          operationName,
          attempt,
          status: response.status,
          delay_ms: delay,
        });
        await sleep(delay);
        continue;
      }
      if (response.status === 429) {
        throw new ShopifyRateLimitError('Shopify rate limit exceeded after retries', {
          status: response.status,
        });
      }
      throw new Error(`Shopify server error ${response.status} on ${operationName}`);
    }

    if (response.status === 401 || response.status === 403) {
      throw new ShopifyAuthError(`Shopify auth error (${response.status})`, {
        status: response.status,
      });
    }

    let body;
    try {
      body = await response.json();
    } catch (_e) {
      throw new Error(`Shopify response was not JSON (status ${response.status}) on ${operationName}`);
    }

    if (body.errors && body.errors.length > 0) {
      throw new ShopifyGraphQLError(`GraphQL errors on ${operationName}`, body.errors);
    }

    logJson('info', {
      msg: 'shopify_request',
      operationName,
      status: response.status,
      duration_ms: Date.now() - requestStart,
    });

    return body.data;
  }

  throw lastError || new Error(`shopifyGraphQL: exhausted retries on ${operationName}`);
}

const Q_GET_CUSTOMER_WISHLIST = `
  query GetCustomerWishlist($id: ID!) {
    customer(id: $id) {
      id
      metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
        id
        value
        compareDigest
      }
    }
  }
`;

const M_SET_CUSTOMER_WISHLIST = `
  mutation SetCustomerWishlist($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id key namespace value compareDigest }
      userErrors { field message code }
    }
  }
`;

const Q_GET_PRODUCTS_BY_IDS = `
  query GetProductsByIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        handle
        onlineStoreUrl
        status
        totalInventory
        tracksInventory
        featuredImage { url altText }
        priceRangeV2 { minVariantPrice { amount currencyCode } }
      }
    }
  }
`;

const Q_VERIFY_CUSTOMER = `
  query VerifyCustomer($id: ID!) {
    customer(id: $id) { id }
  }
`;

/**
 * Read the wishlist metafield for a customer.
 *
 * Returns the raw JSON string stored in the metafield (or null if the
 * metafield hasn't been created yet) along with the `compareDigest` value
 * for use in compare-and-swap writes.
 *
 * Throws ShopifyNotFoundError if the customer does not exist on this shop.
 */
async function fetchCustomerWishlist(customerId) {
  const data = await shopifyGraphQL(Q_GET_CUSTOMER_WISHLIST, { id: customerId }, 'GetCustomerWishlist');
  if (!data || !data.customer) {
    throw new ShopifyNotFoundError('Customer not found', { customerId });
  }
  const mf = data.customer.metafield;
  return {
    value: mf ? mf.value : null,
    compareDigest: mf ? mf.compareDigest : null,
  };
}

/**
 * Persist the wishlist metafield using compare-and-swap (CAS) semantics.
 *
 * - On first write `compareDigest` should be null.
 * - On updates pass the digest returned by the prior read; Shopify returns
 *   a STALE_OBJECT user error if another writer has changed the value in
 *   between, which surfaces as a ShopifyGraphQLError to the caller.
 *
 * Returns the new compareDigest from the write so the caller can chain
 * subsequent edits without an extra read.
 */
async function setCustomerWishlist(customerId, gids, compareDigest) {
  const input = [
    {
      ownerId: customerId,
      namespace: METAFIELD_NAMESPACE,
      key: METAFIELD_KEY,
      type: METAFIELD_TYPE,
      value: JSON.stringify(Array.isArray(gids) ? gids : []),
      compareDigest: compareDigest === undefined ? null : compareDigest,
    },
  ];
  const data = await shopifyGraphQL(M_SET_CUSTOMER_WISHLIST, { metafields: input }, 'SetCustomerWishlist');
  const result = data.metafieldsSet;
  if (result.userErrors && result.userErrors.length > 0) {
    throw new ShopifyGraphQLError('metafieldsSet returned userErrors', result.userErrors);
  }
  const saved = result.metafields && result.metafields[0];
  return saved ? saved.compareDigest : null;
}

/**
 * Hydrate an array of product GIDs into product cards suitable for the
 * wishlist UI. Products that no longer exist (deleted from the shop) are
 * silently skipped — the next write will prune them from the metafield.
 */
async function fetchProductsByGids(gids) {
  if (!Array.isArray(gids) || gids.length === 0) return [];
  const data = await shopifyGraphQL(Q_GET_PRODUCTS_BY_IDS, { ids: gids }, 'GetProductsByIds');
  return (data.nodes || [])
    .filter((n) => n && n.id)
    .map((p) => {
      const minPrice =
        p.priceRangeV2 && p.priceRangeV2.minVariantPrice ? p.priceRangeV2.minVariantPrice : null;
      const tracks = p.tracksInventory !== false;
      const inStock = !tracks || (typeof p.totalInventory === 'number' && p.totalInventory > 0);
      const available = p.status === 'ACTIVE' && inStock;
      return {
        id: p.id,
        title: p.title,
        handle: p.handle,
        url: p.onlineStoreUrl || (p.handle ? `/products/${p.handle}` : null),
        image: p.featuredImage
          ? { src: p.featuredImage.url, alt: p.featuredImage.altText || p.title || '' }
          : null,
        price: minPrice ? { amount: minPrice.amount, currencyCode: minPrice.currencyCode } : null,
        available,
      };
    });
}

/**
 * Cheap existence check so write endpoints can refuse random GID guesses
 * with a clear 404 before incurring the cost of a metafield write.
 */
async function verifyCustomerExists(customerId) {
  const data = await shopifyGraphQL(Q_VERIFY_CUSTOMER, { id: customerId }, 'VerifyCustomer');
  return Boolean(data && data.customer && data.customer.id);
}

module.exports = {
  fetchCustomerWishlist,
  setCustomerWishlist,
  fetchProductsByGids,
  verifyCustomerExists,
  ShopifyAuthError,
  ShopifyNotFoundError,
  ShopifyRateLimitError,
  ShopifyGraphQLError,
};
