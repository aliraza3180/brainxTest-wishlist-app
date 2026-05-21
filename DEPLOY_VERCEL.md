# Deploy backend to Vercel

Store: `whishlistapp-fkqsledg.myshopify.com`

## Option A — Vercel CLI (fastest, no GitHub required)

### 1. Log in (one time)

```powershell
cd "C:\Users\Hp\Desktop\Wishlist app shopify"
npx vercel@latest login
```

Complete the browser login when prompted.

### 2. Deploy to production

```powershell
npx vercel@latest --prod
```

Answer prompts:

- Set up and deploy? **Y**
- Which scope? Your account
- Link to existing project? **N** (first time) or **Y** (redeploy)
- Project name: e.g. `brainx-wishlist` or `whishlist-api`
- Directory: `./` (repo root — where `vercel.json` is)

Copy the **Production URL** from the output, e.g. `https://brainx-wishlist.vercel.app`.

### 3. Add environment variables (Vercel Dashboard)

Open: **https://vercel.com** → your project → **Settings** → **Environment Variables**

Add all four for **Production** (and Preview if you want):

| Name | Value (from `backend/.env`) |
|------|-----------------------------|
| `SHOPIFY_STORE_DOMAIN` | `whishlistapp-fkqsledg.myshopify.com` |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | your `shpat_…` token |
| `SHOPIFY_API_VERSION` | `2025-01` |
| `WISHLIST_API_SECRET` | same as in `.env` |

**Save** → **Deployments** → **⋯** on latest → **Redeploy** (so env vars apply).

### 4. Verify

```powershell
$base = "https://YOUR-APP.vercel.app"
Invoke-RestMethod "$base/health"
Invoke-RestMethod "$base/api/wishlist?customerId=gid://shopify/Customer/9163792056343"
```

### 5. Update Shopify shop metafield

**Settings → Custom data → Shop → `wishlist_api_url`**

Set to:

```text
https://YOUR-APP.vercel.app
```

No trailing slash. Secret metafield stays the same.

### 6. Theme (if not done)

**Customize theme → Wishlist page → Wishlist API base URL** = same Vercel URL.

---

## Option B — Vercel Dashboard + GitHub

1. Create repo `brainxTest-wishlist-app` on GitHub (web UI: New repository).
2. Push code:

   ```powershell
   git remote add origin https://github.com/YOUR_USERNAME/brainxTest-wishlist-app.git
   git push -u origin feat/wishlist-mvp
   ```

3. **vercel.com** → **Add New Project** → Import the repo.
4. Root directory: **`.`** (repository root).
5. Add the **four environment variables** (table above).
6. **Deploy**.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| 404 on `/api/wishlist` | Root must be repo root; `vercel.json` must exist |
| 500 SHOPIFY_API_ERROR | Redeploy after setting env vars |
| CORS on storefront | `SHOPIFY_STORE_DOMAIN` exactly `whishlistapp-fkqsledg.myshopify.com` |
| Theme still fails | Update `wishlist_api_url` to Vercel URL, not `localhost` |
