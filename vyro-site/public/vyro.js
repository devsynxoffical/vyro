/*! VYRO loader. Install once: <script src="https://YOUR-VYRO-SITE/vyro.js" data-key="vyro_pk_..." async></script> */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script || window.VYRO) return;
  var key = script.getAttribute('data-key') || '';
  var app = new URL(script.src).origin;
  var api = app + '/api';
  var listeners = [];
  var overlay = null;
  var frame = null;
  var products = [];
  var wanted = null;

  var VYRO = (window.VYRO = {
    active: false,
    productLimit: null,
    /** Opens the try-on, optionally on one product (its SKU). No-op while the subscription is inactive. */
    open: function (sku) {
      if (!VYRO.active || overlay) return;
      wanted = typeof sku === 'string' && sku ? sku : null;
      overlay = document.createElement('div');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-label', 'Virtual try-on');
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:2147483646;background:rgba(10,10,15,.72);display:flex;align-items:center;justify-content:center;padding:12px';
      frame = document.createElement('iframe');
      frame.src = app + '/embed';
      frame.allow = 'camera';
      frame.title = 'Virtual try-on';
      frame.style.cssText =
        'width:min(480px,100%);height:min(860px,100%);border:0;border-radius:16px;background:#0a0a0f';
      var close = document.createElement('button');
      close.type = 'button';
      close.textContent = '\u00d7'; // escaped: the host page may not be UTF-8
      close.setAttribute('aria-label', 'Close try-on');
      close.style.cssText =
        'position:absolute;top:14px;right:16px;width:40px;height:40px;border-radius:50%;border:0;background:#fff;color:#111;font-size:24px;line-height:1;cursor:pointer';
      close.onclick = VYRO.close;
      overlay.onclick = function (e) {
        if (e.target === overlay) VYRO.close();
      };
      overlay.appendChild(frame);
      overlay.appendChild(close);
      document.body.appendChild(overlay);
    },
    close: function () {
      if (overlay) overlay.remove();
      overlay = null;
      frame = null;
    },
    /** Runs fn once the licence check has finished: fn(active). */
    ready: function (fn) {
      if (listeners) listeners.push(fn);
      else fn(VYRO.active);
    },
  });

  // The try-on frame asks for the catalogue once it has loaded. It is sent
  // only to VYRO's own frame, and only this page's verified catalogue.
  window.addEventListener('message', function (e) {
    if (!frame || e.source !== frame.contentWindow || e.origin !== app) return;
    if (e.data && e.data.type === 'vyro:embed-ready') {
      frame.contentWindow.postMessage({ type: 'vyro:catalog', products: products, select: wanted }, app);
    } else if (e.data && e.data.type === 'vyro:close') {
      VYRO.close();
    }
  });

  function done(active, limit, list) {
    products = active && Array.isArray(list) ? list : [];
    VYRO.active = active && products.length > 0;
    active = VYRO.active;
    VYRO.productLimit = limit == null ? null : limit;
    // Anything marked data-vyro-show appears only while the subscription is live.
    [].forEach.call(document.querySelectorAll('[data-vyro-show]'), function (el) {
      el.hidden = !active;
    });
    if (active) {
      document.addEventListener('click', function (e) {
        var t = e.target && e.target.closest ? e.target.closest('[data-vyro-open]') : null;
        if (t) {
          e.preventDefault();
          VYRO.open(t.getAttribute('data-vyro-open'));
        }
      });
      if (script.getAttribute('data-button') !== 'off') addButton();
    }
    var fns = listeners;
    listeners = null;
    fns.forEach(function (fn) {
      try {
        fn(active);
      } catch (e) {
        /* a page callback must not break the loader */
      }
    });
    document.dispatchEvent(new CustomEvent(active ? 'vyro:ready' : 'vyro:inactive'));
  }

  function addButton() {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = script.getAttribute('data-label') || 'Try it on';
    b.style.cssText =
      'position:fixed;right:18px;bottom:18px;z-index:2147483645;padding:12px 20px;border:0;border-radius:999px;background:#111;color:#fff;font:600 15px system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25);cursor:pointer';
    b.onclick = function () {
      VYRO.open();
    };
    (document.body || document.documentElement).appendChild(b);
  }

  if (!/^vyro_pk_[0-9a-f]{32}$/.test(key)) return done(false);
  fetch(api + '/widget-status?key=' + encodeURIComponent(key))
    .then(function (r) {
      return r.json();
    })
    .then(function (s) {
      done(s && s.active === true, s && s.product_limit, s && s.products);
    })
    .catch(function () {
      done(false);
    });
})();
