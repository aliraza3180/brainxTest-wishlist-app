# Customer Wishlist App — BrainX Submission

**Repository:** [brainxTest-wishlist-app](https://github.com/aliraza3180/brainxTest-wishlist-app)  
**Author:** Ali Raza

## Submission details

| Item | Value |
|------|--------|
| Pull request | https://github.com/aliraza3180/brainxTest-wishlist-app/pull/1 |
| Store URL | https://whishlistapp-fkqsledg.myshopify.com |
| Storefront password | `test` |
| Collaborator code | **7259** (Settings → Users → Store security) |
| Backend (Vercel) | https://brainx-wishlist-api.vercel.app |

---

## Overview

Logged-in customers can add products to a wishlist from the product page and view them on a **Wishlist** page (remove items, add to cart).

- **Storage:** Shopify customer metafield `custom.wishlist` (type: list of products)
- **Backend:** Node.js + Express on Vercel (Admin GraphQL `2025-01`)
- **Frontend:** Dawn-compatible Liquid + `theme/assets/wishlist.js`

Guests do not see the wishlist button until they log in.

---

## API (backend)

Base URL: `https://brainx-wishlist-api.vercel.app` (or `http://localhost:3000` locally)

| Route | Method | Input | Action |
|-------|--------|-------|--------|
| `/api/wishlist/add` | POST | `{ customerId, productId }` | Add product to wishlist metafield |
| `/api/wishlist` | GET | `?customerId=` | Get wishlist products (title, image, price, URL) |
| `/api/wishlist/remove` | DELETE | `{ customerId, productId }` | Remove product from wishlist |

POST and DELETE require header: `X-Wishlist-Secret` (same as `WISHLIST_API_SECRET`).

Health: `GET /health` → `{ "ok": true }`

---

## Shopify setup

1. **Custom app** with scopes: `read_customers`, `write_customers`, `read_products` → Admin API token (`shpat_…`).
2. **Customer metafield:** namespace `custom`, key `wishlist`, type **List of products**.
3. **Shop metafields:**
   - `custom.wishlist_api_url` → Vercel URL (no trailing slash)
   - `custom.wishlist_api_secret` → same as `WISHLIST_API_SECRET`
4. **Theme:** copy `theme/` into Dawn (`assets`, `snippets`, `sections`, `templates`).
5. **Product page** — in `sections/main-product.liquid`:

   ```liquid
   {% render 'wishlist-button', product: product %}
   ```

6. **Wishlist page** — create page “Wishlist”, template `page.wishlist`.

Button text: **Add to Wishlist** / **Remove from Wishlist** depending on state.

---

## Local development

```bash
git clone https://github.com/aliraza3180/brainxTest-wishlist-app.git
cd brainxTest-wishlist-app
cp .env.example backend/.env
# Fill: SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_API_VERSION, WISHLIST_API_SECRET

cd backend
npm install
npm start
```

Tests: `cd backend && npm test`

**Example — add to wishlist:**

```bash
curl -X POST http://localhost:3000/api/wishlist/add \
  -H "Content-Type: application/json" \
  -H "X-Wishlist-Secret: YOUR_SECRET" \
  -d '{"customerId":"gid://shopify/Customer/ID","productId":"gid://shopify/Product/ID"}'
```

**Example — get wishlist:**

```bash
curl "http://localhost:3000/api/wishlist?customerId=gid://shopify/Customer/ID"
```

---

## Deploy backend (Vercel)

1. Import this repo on [vercel.com](https://vercel.com) (root directory = repo root; uses `vercel.json`).
2. Set environment variables:

   | Variable | Example |
   |----------|---------|
   | `SHOPIFY_STORE_DOMAIN` | `whishlistapp-fkqsledg.myshopify.com` |
   | `SHOPIFY_ADMIN_ACCESS_TOKEN` | `shpat_…` |
   | `SHOPIFY_API_VERSION` | `2025-01` |
   | `WISHLIST_API_SECRET` | 64-char hex (see `.env.example`) |

3. Deploy, then set shop metafield `custom.wishlist_api_url` to the production URL.
4. Redeploy after changing env vars.

**CLI (optional):** from repo root, `npx vercel login` then `npx vercel --prod`.

**Verify:**

```bash
curl https://brainx-wishlist-api.vercel.app/health
```

---

## Project structure

```
backend/          Express API, Shopify GraphQL, middleware
theme/            Liquid snippet, section, template, JS/CSS
vercel.json       Serverless entry (backend/app.js)
.env.example      Required environment variables
```

---

## Notes for reviewers

- Wishlist data is in **Shopify metafields**, not a separate database.
- Write requests use a shared secret + CORS allowlist (MVP; not App Proxy HMAC).
- Approve collaborator access under **Settings → Users** after using code **7259**.
