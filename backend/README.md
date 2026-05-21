# Wishlist Backend — Local API Testing

## Setup

```bash
cd backend
cp ../.env.example .env
# Fill in SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_API_VERSION, WISHLIST_API_SECRET
npm install
npm start
```

Server listens on `http://localhost:3000` by default (`PORT` overrides).

## curl commands

Replace placeholders:

- `CUSTOMER_GID` — e.g. `gid://shopify/Customer/1234567890`
- `PRODUCT_GID` — e.g. `gid://shopify/Product/9876543210`
- `YOUR_SECRET` — value of `WISHLIST_API_SECRET` from `.env`

### Health check

```bash
curl -s http://localhost:3000/health
```

Expected: `{"ok":true}`

### GET wishlist (logged-in customer products)

```bash
curl -s "http://localhost:3000/api/wishlist?customerId=CUSTOMER_GID"
```

Expected (200):

```json
{ "success": true, "products": [] }
```

Invalid customer GID (400):

```bash
curl -s "http://localhost:3000/api/wishlist?customerId=not-a-gid"
```

Expected: `{"success":false,"error":"INVALID_CUSTOMER_ID"}`

### POST add to wishlist

```bash
curl -s -X POST http://localhost:3000/api/wishlist/add \
  -H "Content-Type: application/json" \
  -H "X-Wishlist-Secret: YOUR_SECRET" \
  -d "{\"customerId\":\"CUSTOMER_GID\",\"productId\":\"PRODUCT_GID\"}"
```

Expected (200):

```json
{ "success": true, "wishlist": ["gid://shopify/Product/..."] }
```

Missing secret (401):

```bash
curl -s -X POST http://localhost:3000/api/wishlist/add \
  -H "Content-Type: application/json" \
  -d "{\"customerId\":\"CUSTOMER_GID\",\"productId\":\"PRODUCT_GID\"}"
```

Expected: `{"success":false,"error":"INVALID_SECRET"}`

Duplicate add (409):

```bash
# Run the successful POST twice
```

Expected: `{"success":false,"error":"PRODUCT_ALREADY_IN_WISHLIST"}`

### DELETE remove from wishlist

```bash
curl -s -X DELETE http://localhost:3000/api/wishlist/remove \
  -H "Content-Type: application/json" \
  -H "X-Wishlist-Secret: YOUR_SECRET" \
  -d "{\"customerId\":\"CUSTOMER_GID\",\"productId\":\"PRODUCT_GID\"}"
```

Expected (200):

```json
{ "success": true, "wishlist": [] }
```

Product not in list (404):

```bash
# DELETE a product that was never added
```

Expected: `{"success":false,"error":"PRODUCT_NOT_IN_WISHLIST"}`

## Response codes summary

| Endpoint | 200 | 400 | 401 | 404 | 409 | 429 | 500 |
|----------|-----|-----|-----|-----|-----|-----|-----|
| GET `/api/wishlist` | ✅ products | INVALID_CUSTOMER_ID | — | CUSTOMER_NOT_FOUND | — | RATE_LIMITED | SHOPIFY_API_ERROR |
| POST `/api/wishlist/add` | ✅ wishlist | INVALID_PAYLOAD | INVALID_SECRET | CUSTOMER_NOT_FOUND | PRODUCT_ALREADY_IN_WISHLIST | RATE_LIMITED | SHOPIFY_API_ERROR |
| DELETE `/api/wishlist/remove` | ✅ wishlist | INVALID_PAYLOAD | INVALID_SECRET | CUSTOMER_NOT_FOUND / PRODUCT_NOT_IN_WISHLIST | WISHLIST_CONFLICT* | RATE_LIMITED | SHOPIFY_API_ERROR |

\* Concurrent tab writes can trigger compare-and-swap conflict (`WISHLIST_CONFLICT`).
