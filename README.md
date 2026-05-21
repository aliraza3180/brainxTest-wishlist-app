# brainxTest-wishlist-app

Customer Wishlist App for Shopify — BrainX task submission.

Submitted by **Ali Raza** ([aliraza3180](https://github.com/aliraza3180)).

---

## Submission

| Item | Link / value |
|------|--------------|
| Pull request | https://github.com/aliraza3180/brainxTest-wishlist-app/pull/1 |
| Demo store URL | https://whishlistapp-fkqsledg.myshopify.com |
| Storefront password | `test` |
| Collaborator request code | **7259** |
| Backend deployment (Vercel) | https://brainx-wishlist-api.vercel.app |

> To request store access: Shopify Partners / Dev Dashboard → **Request store access** → enter the store URL and the collaborator code above. I will approve from store admin (**Settings → Users**).

---

## Objective

Customers can add products to a wishlist and view their wishlist on the storefront. Wishlist data is stored in Shopify customer metafields (logged-in customers only). The backend is hosted on Vercel.

---

## 1. Backend (Node.js + Express)

Deployed to Vercel as a single serverless function (`vercel.json` → `backend/app.js`).

| Route | Method | Input | Action |
|-------|--------|-------|--------|
| `/api/wishlist/add` | `POST` | `{ customerId, productId }` | Adds the product to the customer's wishlist |
| `/api/wishlist` | `GET` | `?customerId=<id>` | Returns the customer's wishlist products |
| `/api/wishlist/remove` | `DELETE` | `{ customerId, productId }` | Removes the product from the wishlist |
| `/health` | `GET` | — | Health check (`{ ok: true }`) |

POST and DELETE require header `X-Wishlist-Secret` (same value as the `WISHLIST_API_SECRET` env var). The theme reads this secret from a shop metafield so it is never hardcoded.

### Code structure

```
backend/
├── app.js                  Express app (CORS, JSON, routes)
├── routes/
│   └── wishlist.js         GET, POST /add, DELETE /remove
├── services/
│   └── shopify.js          Admin GraphQL client + metafield helpers
├── middleware/
│   ├── auth.js             X-Wishlist-Secret check
│   ├── validate.js         GID validation
│   ├── rateLimit.js        Per-IP rate limit
│   ├── logger.js           Structured request logs
│   └── errorHandler.js     Maps errors to HTTP status codes
├── utils/
│   ├── metafields.js       Pure helpers (add/remove/parse list)
│   └── metafields.test.js  Unit tests
└── scripts/
    └── smoke-test.js       End-to-end check against Shopify
```

Environment variables (see [`.env.example`](.env.example)):

| Variable | Purpose |
|----------|---------|
| `SHOPIFY_STORE_DOMAIN` | e.g. `whishlistapp-fkqsledg.myshopify.com` |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Admin API token (`shpat_…`) |
| `SHOPIFY_API_VERSION` | `2025-01` |
| `WISHLIST_API_SECRET` | Shared secret for write requests |

---

## 2. Frontend (Liquid + vanilla JS)

Theme files live under [`theme/`](theme/) and are dropped into a Dawn theme.

| File | Purpose |
|------|---------|
| `theme/snippets/wishlist-button.liquid` | "Add to Wishlist" / "Remove from Wishlist" button |
| `theme/sections/main-wishlist.liquid` | Wishlist page section (grid + empty state) |
| `theme/templates/page.wishlist.json` | Page template that mounts the section |
| `theme/assets/wishlist.js` | Calls the backend API, updates UI, handles Add to Cart |
| `theme/assets/wishlist.css` | Storefront styles |

**Product page** — inside `sections/main-product.liquid`, near the buy buttons:

```liquid
{% render 'wishlist-button', product: product %}
```

**Wishlist page** — Online Store → Pages → new page **Wishlist**, template **page.wishlist**.

Behavior:

- Button is hidden for guests (logged-in only, per task spec).
- When the product is in the wishlist, label changes to **Remove from Wishlist**.
- Wishlist page lists each product with image, title, price, and an **Add to Cart** button.
- Add to Cart uses the product's first available variant via `/cart/add.js`.

---

## 3. Data model — Shopify metafields

Wishlist data is stored on the **customer** (logged-in users only):

| Owner | Namespace | Key | Type |
|-------|-----------|-----|------|
| Customer | `custom` | `wishlist` | List of products (`list.product_reference`) |

Two **shop** metafields wire the theme to the deployed backend:

| Namespace | Key | Value |
|-----------|-----|-------|
| `custom` | `wishlist_api_url` | `https://brainx-wishlist-api.vercel.app` |
| `custom` | `wishlist_api_secret` | Same value as `WISHLIST_API_SECRET` |

---

## 4. Deployment (Vercel)

1. Push the repo to GitHub.
2. Import the project at https://vercel.com (root directory = repo root — uses `vercel.json`).
3. Add the four environment variables (see table above) for **Production**.
4. Deploy.
5. Set the shop metafield `custom.wishlist_api_url` to the production URL.
6. Verify: `curl https://brainx-wishlist-api.vercel.app/health` → `{"ok":true}`.

CLI shortcut from the repo root:

```bash
npx vercel login
npx vercel --prod
```

---

## Run locally

```bash
git clone https://github.com/aliraza3180/brainxTest-wishlist-app.git
cd brainxTest-wishlist-app

cp .env.example backend/.env
# Fill SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_API_VERSION, WISHLIST_API_SECRET

cd backend
npm install
npm start          # http://localhost:3000
npm test           # unit tests
```

### Example requests

Add a product:

```bash
curl -X POST http://localhost:3000/api/wishlist/add \
  -H "Content-Type: application/json" \
  -H "X-Wishlist-Secret: $WISHLIST_API_SECRET" \
  -d '{"customerId":"gid://shopify/Customer/123","productId":"gid://shopify/Product/456"}'
```

Get the wishlist:

```bash
curl "http://localhost:3000/api/wishlist?customerId=gid://shopify/Customer/123"
```

Remove a product:

```bash
curl -X DELETE http://localhost:3000/api/wishlist/remove \
  -H "Content-Type: application/json" \
  -H "X-Wishlist-Secret: $WISHLIST_API_SECRET" \
  -d '{"customerId":"gid://shopify/Customer/123","productId":"gid://shopify/Product/456"}'
```

---

## Code quality

- Modular structure: `routes`, `services`, `middleware`, `utils` are separated.
- All secrets and store-specific values are loaded from environment variables.
- Pure helpers in `utils/metafields.js` are covered by `node:test` unit tests.
- Each Express middleware has a single responsibility (auth, validation, rate limit, errors).
- Comments explain the non-obvious bits (CAS write, GID handling, CORS) without narrating trivial code.

---

## How to evaluate quickly

1. Open https://whishlistapp-fkqsledg.myshopify.com — password `test`.
2. Log in as a customer (or create one).
3. Open any product → click **Add to Wishlist** → reload → button now says **Remove from Wishlist**.
4. Open **/pages/wishlist** → product appears → **Add to Cart** works.
5. Click **Remove** on the wishlist page → item disappears, customer metafield `custom.wishlist` updates in admin.

Backend reachable: https://brainx-wishlist-api.vercel.app/health
