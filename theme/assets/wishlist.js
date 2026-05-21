/**
 * Wishlist storefront client — vanilla JS, no build step.
 *
 * Public API:
 *   window.WishlistApp.toggle(productGid)
 *   window.WishlistApp.init()
 *   window.WishlistApp.refresh()
 *
 * State is never cached across renders; the server response is the source
 * of truth after every mutation.
 */
(function () {
  'use strict';

  const buttonStates = new Map();
  const inflightRequests = new Map();
  let pageConfig = null;
  let toastEl = null;
  let observer = null;

  const LABELS = {
    add: 'Add to Wishlist',
    remove: 'Remove from Wishlist',
    pendingAdd: 'Adding…',
    pendingRemove: 'Removing…',
  };

  function getConfigFromButton(btn) {
    const root = btn.closest('[data-wishlist-page]');
    return {
      apiBase: btn.dataset.apiBase || (root && root.dataset.apiBase) || '',
      apiSecret: btn.dataset.apiSecret || (root && root.dataset.apiSecret) || '',
      customerGid: btn.dataset.customerGid || (root && root.dataset.customerGid) || '',
    };
  }

  /** Config from wishlist page section (used when no product-page button exists). */
  function getConfigFromPage() {
    if (pageConfig) return pageConfig;
    const page = document.querySelector('[data-wishlist-page]');
    if (!page) return null;
    return {
      apiBase: page.dataset.apiBase || '',
      apiSecret: page.dataset.apiSecret || '',
      customerGid: page.dataset.customerGid || '',
    };
  }

  function getWishlistConfig(btn) {
    if (btn) return getConfigFromButton(btn);
    return getConfigFromPage() || { apiBase: '', apiSecret: '', customerGid: '' };
  }

  function normalizeApiBase(base) {
    return String(base || '').replace(/\/+$/, '');
  }

  /** Normalize Product/Customer GIDs so Liquid numeric ids match API responses. */
  function normalizeGid(id, resourceType) {
    if (id == null || id === '') return '';
    const s = String(id).trim();
    const match = s.match(/gid:\/\/shopify\/(Product|Customer)\/(\d+)/i);
    if (match) {
      return 'gid://shopify/' + match[1] + '/' + match[2];
    }
    if (/^\d+$/.test(s)) {
      return 'gid://shopify/' + resourceType + '/' + s;
    }
    return s;
  }

  function productGidsMatch(apiId, buttonGid) {
    return normalizeGid(apiId, 'Product') === normalizeGid(buttonGid, 'Product');
  }

  function showToast(message, isError) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'wishlist-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.toggle('wishlist-toast--error', Boolean(isError));
    toastEl.classList.add('wishlist-toast--visible');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () {
      toastEl.classList.remove('wishlist-toast--visible');
    }, 3500);
  }

  function formatMoney(amount, currencyCode) {
    if (amount == null) return '';
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currencyCode || 'USD',
      }).format(Number(amount));
    } catch (_e) {
      return amount + ' ' + (currencyCode || '');
    }
  }

  function setButtonUi(btn, state, inWishlist) {
    const label = btn.querySelector('[data-wishlist-label]');
    btn.dataset.state = state;
    btn.setAttribute('aria-pressed', inWishlist ? 'true' : 'false');
    if (state === 'pending') {
      btn.setAttribute('aria-label', inWishlist ? 'Removing from wishlist' : 'Adding to wishlist');
      if (label) label.textContent = inWishlist ? LABELS.pendingRemove : LABELS.pendingAdd;
      return;
    }
    if (inWishlist) {
      btn.setAttribute('aria-label', 'Remove from wishlist');
      if (label) label.textContent = LABELS.remove;
    } else {
      btn.setAttribute('aria-label', 'Add to wishlist');
      if (label) label.textContent = LABELS.add;
    }
    buttonStates.set(btn.dataset.productGid, inWishlist ? 'added' : 'idle');
  }

  async function apiRequest(method, path, config, body) {
    const url = normalizeApiBase(config.apiBase) + path;
    const headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (config.apiSecret) headers['X-Wishlist-Secret'] = config.apiSecret;

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    let data = {};
    try {
      data = await res.json();
    } catch (_e) {
      data = {};
    }

    if (!res.ok) {
      const err = new Error(data.error || 'Request failed');
      err.status = res.status;
      err.payload = data;
      throw err;
    }
    return data;
  }

  async function fetchWishlistProducts(config, signal) {
    const q = encodeURIComponent(config.customerGid);
    const url = normalizeApiBase(config.apiBase) + '/api/wishlist?customerId=' + q;
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || 'Failed to load wishlist');
      err.status = res.status;
      throw err;
    }
    return data.products || [];
  }

  function dispatchUpdated(detail) {
    document.dispatchEvent(new CustomEvent('wishlist:updated', { detail }));
  }

  async function syncButtonFromServer(btn, signal) {
    const config = getConfigFromButton(btn);
    if (!config.apiBase || !config.customerGid) return;
    const products = await fetchWishlistProducts(config, signal);
    const gid = btn.dataset.productGid;
    const inList = products.some(function (p) {
      return productGidsMatch(p.id, gid);
    });
    setButtonUi(btn, 'idle', inList);
  }

  /**
   * Add or remove a product from the wishlist.
   * @param {string} productGid
   * @param {{ remove?: boolean, add?: boolean, cardBtn?: HTMLElement }} [opts]
   *   remove: true when clicking Remove on wishlist page (no product-page button).
   */
  async function toggle(productGid, opts) {
    opts = opts || {};
    const normalizedGid = normalizeGid(productGid, 'Product');
    const btn =
      document.querySelector('[data-wishlist-button][data-product-gid="' + normalizedGid + '"]') ||
      document.querySelector('[data-wishlist-button][data-product-gid="' + productGid + '"]') ||
      document.querySelector('[data-wishlist-button]');

    const config = getWishlistConfig(btn);
    if (!config.apiBase) {
      showToast('Wishlist API URL is not configured.', true);
      return;
    }
    if (!config.apiSecret) {
      showToast('Wishlist API secret is not configured.', true);
      return;
    }

    const prevInflight = inflightRequests.get(normalizedGid);
    if (prevInflight) prevInflight.abort();

    const controller = new AbortController();
    inflightRequests.set(normalizedGid, controller);

    let wasAdded;
    if (opts.remove === true) {
      wasAdded = true;
    } else if (opts.add === true) {
      wasAdded = false;
    } else {
      wasAdded =
        buttonStates.get(normalizedGid) === 'added' ||
        (btn && btn.getAttribute('aria-pressed') === 'true');
    }

    const cardBtn = opts.cardBtn || null;
    if (btn) {
      setButtonUi(btn, 'pending', wasAdded);
    } else if (cardBtn) {
      cardBtn.disabled = true;
      cardBtn.textContent = 'Removing…';
    }

    try {
      const body = {
        customerId: normalizeGid(config.customerGid, 'Customer'),
        productId: normalizedGid,
      };
      const data = wasAdded
        ? await apiRequest('DELETE', '/api/wishlist/remove', config, body)
        : await apiRequest('POST', '/api/wishlist/add', config, body);

      const inList =
        Array.isArray(data.wishlist) &&
        data.wishlist.some(function (g) {
          return productGidsMatch(g, normalizedGid);
        });

      if (btn) setButtonUi(btn, 'idle', inList);
      buttonStates.set(normalizedGid, inList ? 'added' : 'idle');
      dispatchUpdated({ productGid: normalizedGid, wishlist: data.wishlist || [] });
    } catch (err) {
      if (err.status === 409 && err.payload && err.payload.error === 'PRODUCT_ALREADY_IN_WISHLIST') {
        if (btn) setButtonUi(btn, 'idle', true);
        buttonStates.set(normalizedGid, 'added');
        dispatchUpdated({ productGid: normalizedGid, wishlist: [] });
        return;
      }
      if (err.status === 404 && err.payload && err.payload.error === 'PRODUCT_NOT_IN_WISHLIST') {
        if (btn) setButtonUi(btn, 'idle', false);
        buttonStates.set(normalizedGid, 'idle');
        dispatchUpdated({ productGid: normalizedGid, wishlist: [] });
        return;
      }
      if (btn) setButtonUi(btn, 'idle', wasAdded);
      showToast(err.message || 'Something went wrong. Please try again.', true);
      console.error('[WishlistApp]', err);
    } finally {
      if (cardBtn) {
        cardBtn.disabled = false;
        cardBtn.textContent = 'Remove';
      }
      if (inflightRequests.get(normalizedGid) === controller) {
        inflightRequests.delete(normalizedGid);
      }
    }
  }

  function bindButton(btn) {
    if (btn.dataset.wishlistBound === 'true') return;
    btn.dataset.wishlistBound = 'true';
    btn.addEventListener('click', function () {
      toggle(btn.dataset.productGid);
    });
    const config = getConfigFromButton(btn);
    if (!config.apiBase) {
      console.warn('[WishlistApp] Missing data-api-base on wishlist button');
    } else if (!config.customerGid) {
      console.warn('[WishlistApp] Missing data-customer-gid — is customer logged in?');
    } else {
      syncButtonFromServer(btn, new AbortController().signal).catch(function (err) {
        console.warn('[WishlistApp] Could not sync button state:', err.message);
      });
    }
  }

  function observeButtons() {
    document.querySelectorAll('[data-wishlist-button]').forEach(bindButton);
    if (!('IntersectionObserver' in window)) return;
    if (observer) return;
    observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) bindButton(entry.target);
        });
      },
      { rootMargin: '100px' }
    );
    document.querySelectorAll('[data-wishlist-button]').forEach(function (btn) {
      observer.observe(btn);
    });
  }

  function renderProductCard(product) {
    const li = document.createElement('li');
    li.className = 'wishlist-card';
    li.dataset.productGid = product.id;

    const imgHtml = product.image && product.image.src
      ? '<img src="' + product.image.src + '" alt="' + (product.image.alt || product.title || '') + '" loading="lazy" width="400" height="400">'
      : '';

    const priceHtml = product.price
      ? '<p class="wishlist-card__price">' + formatMoney(product.price.amount, product.price.currencyCode) + '</p>'
      : '';

    li.innerHTML =
      '<div class="wishlist-card__media">' + imgHtml + '</div>' +
      '<div class="wishlist-card__body">' +
      '<h2 class="wishlist-card__title"><a href="' + (product.url || '#') + '">' + (product.title || '') + '</a></h2>' +
      priceHtml +
      '<div class="wishlist-card__actions">' +
      '<button type="button" class="button button--primary" data-wishlist-add-to-cart data-handle="' + (product.handle || '') + '"' +
      (product.available ? '' : ' disabled') + '>Add to cart</button>' +
      '<button type="button" class="button button--secondary" data-wishlist-remove-card data-product-gid="' + product.id + '">Remove</button>' +
      '</div></div>';

    const removeBtn = li.querySelector('[data-wishlist-remove-card]');
    removeBtn.addEventListener('click', function () {
      toggle(product.id, { remove: true, cardBtn: removeBtn });
    });

    const cartBtn = li.querySelector('[data-wishlist-add-to-cart]');
    if (cartBtn && product.handle) {
      cartBtn.addEventListener('click', function () {
        addToCart(product.handle, cartBtn);
      });
    }

    return li;
  }

  async function addToCart(handle, btn) {
    btn.disabled = true;
    try {
      const productRes = await fetch('/products/' + handle + '.js');
      if (!productRes.ok) throw new Error('Could not load product');
      const product = await productRes.json();
      const variant =
        (product.variants &&
          product.variants.find(function (v) {
            return v.available;
          })) ||
        (product.variants && product.variants[0]);
      if (!variant) throw new Error('No variant available');

      const cartRoot = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
      const addRes = await fetch(cartRoot + 'cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: variant.id, quantity: 1 }] }),
      });
      if (!addRes.ok) throw new Error('Could not add to cart');

      await refreshCartDrawer();
      showToast('Added to cart');
    } catch (err) {
      showToast(err.message || 'Could not add to cart', true);
      console.error('[WishlistApp]', err);
    } finally {
      btn.disabled = false;
    }
  }

  async function refreshCartDrawer() {
    const sections = ['cart-drawer', 'cart-icon-bubble'];
    const url = '/?sections=' + sections.join(',');
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const html = await res.json();
      sections.forEach(function (id) {
        const el = document.getElementById(id) || document.querySelector('[id^="' + id + '"]');
        if (el && html[id]) {
          el.innerHTML = html[id];
        }
      });
      document.dispatchEvent(new CustomEvent('cart:refresh'));
    } catch (_e) {
      /* Dawn version may differ — cart still updated server-side */
    }
  }

  function setPageLoading(loading) {
    const skeleton = document.querySelector('[data-wishlist-loading]');
    if (skeleton) skeleton.hidden = !loading;
  }

  function renderWishlistPage(products) {
    const grid = document.querySelector('[data-wishlist-grid]');
    const empty = document.querySelector('[data-wishlist-empty]');
    if (!grid || !empty) return;

    grid.innerHTML = '';
    if (!products.length) {
      grid.hidden = true;
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    grid.hidden = false;
    products.forEach(function (p) {
      grid.appendChild(renderProductCard(p));
    });
  }

  async function refresh() {
    const page = document.querySelector('[data-wishlist-page]');
    if (!page || !pageConfig) return;

    setPageLoading(true);
    try {
      const products = await fetchWishlistProducts(pageConfig, new AbortController().signal);
      renderWishlistPage(products);
    } catch (err) {
      showToast(err.message || 'Could not load wishlist', true);
      console.error('[WishlistApp]', err);
    } finally {
      setPageLoading(false);
    }
  }

  function init() {
    observeButtons();

    const page = document.querySelector('[data-wishlist-page]');
    if (!page) return;

    pageConfig = {
      apiBase: page.dataset.apiBase || '',
      apiSecret: page.dataset.apiSecret || '',
      customerGid: page.dataset.customerGid || '',
    };

    if (!pageConfig.apiBase) {
      showToast('Set the Wishlist API URL in theme section settings.', true);
      return;
    }

    refresh();
  }

  function syncAllButtons() {
    document.querySelectorAll('[data-wishlist-button]').forEach(function (btn) {
      syncButtonFromServer(btn, new AbortController().signal).catch(function (err) {
        console.warn('[WishlistApp] sync failed:', err.message);
      });
    });
  }

  document.addEventListener('wishlist:updated', function () {
    syncAllButtons();
    if (document.querySelector('[data-wishlist-page]')) {
      refresh();
    }
  });

  window.WishlistApp = {
    toggle: toggle,
    init: init,
    refresh: refresh,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeButtons);
  } else {
    observeButtons();
  }
})();
