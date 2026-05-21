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
  let observer = null;

  const TOAST_DURATION = 4200;
  const TOAST_ICONS = {
    success:
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>',
    error:
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
    info:
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
  };

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

  function ensureToastContainer() {
    let container = document.getElementById('wishlist-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'wishlist-toast-container';
      container.className = 'wishlist-toast-container';
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-relevant', 'additions');
      document.body.appendChild(container);
    }
    return container;
  }

  /**
   * @param {string} message
   * @param {'success'|'error'|'info'|boolean} [typeOrError] — true = error (legacy)
   */
  function showToast(message, typeOrError) {
    let type = 'info';
    if (typeOrError === true) type = 'error';
    else if (typeof typeOrError === 'string') type = typeOrError;

    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = 'wishlist-toast wishlist-toast--' + type;
    toast.setAttribute('role', 'alert');

    const icon = document.createElement('div');
    icon.className = 'wishlist-toast__icon';
    icon.innerHTML = TOAST_ICONS[type] || TOAST_ICONS.info;

    const body = document.createElement('div');
    body.className = 'wishlist-toast__body';
    const text = document.createElement('p');
    text.className = 'wishlist-toast__message';
    text.textContent = message;
    body.appendChild(text);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'wishlist-toast__close';
    closeBtn.setAttribute('aria-label', 'Dismiss notification');
    closeBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

    const progress = document.createElement('div');
    progress.className = 'wishlist-toast__progress';
    progress.style.animationDuration = TOAST_DURATION + 'ms';

    toast.appendChild(icon);
    toast.appendChild(body);
    toast.appendChild(closeBtn);
    toast.appendChild(progress);
    container.prepend(toast);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        toast.classList.add('wishlist-toast--visible');
      });
    });

    let remaining = TOAST_DURATION;
    let dismissAt = Date.now() + remaining;
    let dismissTimer = null;

    function dismiss() {
      if (toast.classList.contains('wishlist-toast--exit')) return;
      toast.classList.remove('wishlist-toast--visible');
      toast.classList.add('wishlist-toast--exit');
      toast.addEventListener(
        'transitionend',
        function () {
          toast.remove();
        },
        { once: true }
      );
      setTimeout(function () {
        if (toast.parentNode) toast.remove();
      }, 400);
    }

    function scheduleDismiss() {
      clearTimeout(dismissTimer);
      dismissTimer = setTimeout(dismiss, remaining);
    }

    closeBtn.addEventListener('click', dismiss);

    toast.addEventListener('mouseenter', function () {
      clearTimeout(dismissTimer);
      remaining = Math.max(0, dismissAt - Date.now());
      progress.style.animationPlayState = 'paused';
    });

    toast.addEventListener('mouseleave', function () {
      dismissAt = Date.now() + remaining;
      progress.style.animationPlayState = 'running';
      scheduleDismiss();
    });

    scheduleDismiss();
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

      if (inList) {
        showToast('Added to your wishlist', 'success');
      } else {
        showToast('Removed from your wishlist', 'success');
      }
    } catch (err) {
      if (err.status === 409 && err.payload && err.payload.error === 'PRODUCT_ALREADY_IN_WISHLIST') {
        if (btn) setButtonUi(btn, 'idle', true);
        buttonStates.set(normalizedGid, 'added');
        dispatchUpdated({ productGid: normalizedGid, wishlist: [] });
        showToast('This product is already in your wishlist', 'info');
        return;
      }
      if (err.status === 404 && err.payload && err.payload.error === 'PRODUCT_NOT_IN_WISHLIST') {
        if (btn) setButtonUi(btn, 'idle', false);
        buttonStates.set(normalizedGid, 'idle');
        dispatchUpdated({ productGid: normalizedGid, wishlist: [] });
        showToast('Removed from your wishlist', 'success');
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

  function getCartDrawer() {
    return document.querySelector('cart-drawer');
  }

  /** Section ids Dawn expects when re-rendering the drawer (same as product-form.js). */
  function getCartSectionIds() {
    const drawer = getCartDrawer();
    if (drawer && typeof drawer.getSectionsToRender === 'function') {
      return drawer.getSectionsToRender().map(function (section) {
        return section.id;
      });
    }
    return ['cart-drawer', 'cart-icon-bubble'];
  }

  /**
   * Dawn: cart-drawer.renderContents() updates sections and opens the drawer.
   * Falls back to manual section HTML swap + open() on older themes.
   */
  function updateCartDrawer(cartResponse) {
    const drawer = getCartDrawer();
    if (!drawer) return false;

    if (cartResponse && cartResponse.sections && typeof drawer.renderContents === 'function') {
      drawer.classList.remove('is-empty');
      drawer.renderContents(cartResponse);
      return true;
    }

    return false;
  }

  function openCartDrawer() {
    const drawer = getCartDrawer();
    if (!drawer) return;
    drawer.classList.remove('is-empty');
    if (typeof drawer.open === 'function') {
      drawer.open();
    } else {
      drawer.classList.add('active', 'animate');
      document.body.classList.add('overflow-hidden');
    }
  }

  async function refreshCartDrawerSections() {
    const sections = getCartSectionIds();
    const cartRoot = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
    const url = cartRoot + '?sections=' + sections.join(',');
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
    } catch (_e) {
      /* section refresh optional */
    }
  }

  async function addToCart(handle, btn) {
    btn.disabled = true;
    try {
      const cartRoot = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
      const productRes = await fetch(cartRoot + 'products/' + handle + '.js');
      if (!productRes.ok) throw new Error('Could not load product');
      const product = await productRes.json();
      const variant =
        (product.variants &&
          product.variants.find(function (v) {
            return v.available;
          })) ||
        (product.variants && product.variants[0]);
      if (!variant) throw new Error('No variant available');

      const sectionIds = getCartSectionIds();
      const addRes = await fetch(cartRoot + 'cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          items: [{ id: variant.id, quantity: 1 }],
          sections: sectionIds.join(','),
          sections_url: window.location.pathname,
        }),
      });

      const cartData = await addRes.json();
      if (!addRes.ok || cartData.status) {
        throw new Error(cartData.description || cartData.message || 'Could not add to cart');
      }

      if (!updateCartDrawer(cartData)) {
        await refreshCartDrawerSections();
        openCartDrawer();
      }

      showToast('Added to cart', 'success');
    } catch (err) {
      showToast(err.message || 'Could not add to cart', true);
      console.error('[WishlistApp]', err);
    } finally {
      btn.disabled = false;
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
