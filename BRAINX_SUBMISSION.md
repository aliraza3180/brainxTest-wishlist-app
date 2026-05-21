# BrainX — Customer Wishlist App

**Repo:** `brainxTest-wishlist-app`  
**Author:** Ali Raza (`aliraza3180`)

Fill in the links below before you email HR / the reviewer.

| Item | Your value |
|------|------------|
| GitHub PR | Create here: https://github.com/aliraza3180/brainxTest-wishlist-app/pull/new/feat/wishlist-mvp — then paste `/pull/1` URL |
| Store URL | https://whishlistapp-fkqsledg.myshopify.com |
| Store password | _paste storefront password here_ |
| Collaborator code | _Partners → Stores → your dev store → collaborator request code_ |
| Backend (Vercel) | https://brainx-wishlist-api.vercel.app |

---

## What this project does

Logged-in customers can add products to a wishlist from the product page and open a **Wishlist** page to see saved items, remove them, or add them to the cart.

Wishlist product IDs are stored on the **customer** in Shopify:

- Namespace: `custom`
- Key: `wishlist`
- Type: **List of products** (`list.product_reference`)

The Node/Express backend talks to Shopify Admin GraphQL and exposes the three routes required in the task. The Dawn theme uses Liquid + `wishlist.js` to call that API.

Guests do not get a wishlist button (login required).

---

## Task requirements — how they are met

### Backend (Node.js + Express on Vercel)

| Route | Method | Body / query | What it does |
|-------|--------|--------------|--------------|
| `/api/wishlist/add` | POST | `{ customerId, productId }` | Adds product GID to customer metafield |
| `/api/wishlist` | GET | `?customerId=` | Returns wishlist products (title, image, price, URL) |
| `/api/wishlist/remove` | DELETE | `{ customerId, productId }` | Removes product from metafield |

Writes need header `X-Wishlist-Secret` (same value as `WISHLIST_API_SECRET` in Vercel).

Health check: `GET /health` → `{ "ok": true }`

Code layout:

- `backend/app.js` — Express app
- `backend/routes/wishlist.js` — three routes
- `backend/services/shopify.js` — GraphQL + metafield updates
- `backend/middleware/` — secret check, validation, rate limit, errors

### Frontend (Liquid theme)

Copy everything from `theme/` into your Dawn theme:

| File | Purpose |
|------|---------|
| `snippets/wishlist-button.liquid` | Add / Remove on product page |
| `sections/main-wishlist.liquid` | Wishlist page grid |
| `templates/page.wishlist.json` | Page template |
| `assets/wishlist.js`, `wishlist.css` | API calls + UI |

**Product page** — in `sections/main-product.liquid`, near buy buttons:

```liquid
{% render 'wishlist-button', product: product %}
```

**Wishlist page** — Admin → Pages → new page “Wishlist” → template **wishlist** (`page.wishlist`).

Button label switches between **Add to Wishlist** and **Remove from Wishlist** when the product is already saved.

### Data model

No separate database. Logged-in customers only; data lives in Shopify customer metafield `custom.wishlist`.

Shop metafields wire the theme to the API:

| Shop metafield | Purpose |
|----------------|---------|
| `custom.wishlist_api_url` | Vercel URL (no trailing slash) |
| `custom.wishlist_api_secret` | Same as `WISHLIST_API_SECRET` |

---

## Shopify setup (one-time)

1. **Dev store** in Shopify Partners (share collaborator code when done).
2. **Custom app** — scopes: `read_customers`, `write_customers`, `read_products` → copy `shpat_` token.
3. **Customer metafield definition** — `custom.wishlist`, type *List of products*.
4. **Shop metafields** — `wishlist_api_url`, `wishlist_api_secret` (see above).
5. **Theme** — copy `theme/` files and add the snippet on the product section.
6. **Page** — Wishlist page using template `page.wishlist`.

---

## Run locally

```powershell
cd "C:\Users\Hp\Desktop\Wishlist app shopify"
copy .env.example backend\.env
# Edit backend\.env with your store, token, and secret

cd backend
npm install
npm start
```

Server: http://localhost:3000

Tests:

```powershell
cd backend
npm test
```

More curl examples: `backend/README.md`.

---

## Deploy backend (Vercel)

Short version:

1. Push repo to GitHub (`brainxTest-wishlist-app`).
2. Import project on vercel.com (root = repo root, uses `vercel.json`).
3. Set env vars: `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_ACCESS_TOKEN`, `SHOPIFY_API_VERSION` (`2025-01`), `WISHLIST_API_SECRET`.
4. Deploy → copy production URL into shop metafield `custom.wishlist_api_url`.
5. Redeploy if you change env vars.

Step-by-step CLI notes: `DEPLOY_VERCEL.md`.

---

## GitHub — push and open PR

After you recreate the empty repo on GitHub:

```powershell
cd "C:\Users\Hp\Desktop\Wishlist app shopify"

git config --global user.name "Ali Raza"
git config --global user.email "aliraza.dev08@gmail.com"

Remove-Item -Recurse -Force .git -ErrorAction SilentlyContinue
git init
git add .
git status
# Confirm backend\.env is NOT listed

git commit -m "feat: customer wishlist app for BrainX task"
git branch -M main
git remote add origin https://github.com/aliraza3180/brainxTest-wishlist-app.git
git push -u origin main
```

Optional feature branch + PR:

```powershell
git checkout -b feat/wishlist-mvp
git push -u origin feat/wishlist-mvp
```

Open PR on GitHub: **base `main`** ← **compare `feat/wishlist-mvp`**, then paste the PR link in the table at the top of this file.

---

## Quick test on the live store

1. Log in as a customer on the dev store.
2. Open a product → **Add to Wishlist** → refresh → button should say **Remove from Wishlist**.
3. Open **/pages/wishlist** → product appears → **Add to Cart** works.
4. **Remove** → item disappears.

API test (replace customer GID):

```powershell
$base = "https://brainx-wishlist-api.vercel.app"
Invoke-RestMethod "$base/health"
Invoke-RestMethod "$base/api/wishlist?customerId=gid://shopify/Customer/YOUR_ID"
```

---

## What to send the reviewer

1. PR link (GitHub)  
2. Store URL + storefront password  
3. Collaborator code (Partners dashboard)  
4. Short note that backend is on Vercel and metafield is `custom.wishlist`

---

## Notes for reviewers

- **Auth:** MVP uses a shared secret header + CORS on the store domain, not App Proxy HMAC. Fine for this task; not production-grade session binding.
- **Guests:** No wishlist until the customer logs in.
- **Env:** `.env` is gitignored; use `.env.example` as the template.

---

## Related files in this repo

| File | Use |
|------|-----|
| `README.md` | Technical overview and API reference |
| `DEPLOY_VERCEL.md` | Vercel deploy commands |
| `backend/README.md` | Local curl testing |
| `.env.example` | Required environment variables |
