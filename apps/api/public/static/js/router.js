// HUFRA client-side router.
//
// Tab taps swap only <main> (plus footer + active-tab state) instead of
// reloading the whole document. Benefits: no white flash, the shared shell
// (header, tab bar, scripts, fonts, Leaflet) is parsed once, pages are
// prefetched on touch, and the map page is kept alive (DOM + Leaflet state)
// while you visit other tabs, so coming back is instant.
//
// Two modes:
//   web    - pages are fetched from the server (/map, /report, ...).
//   native - the iOS/Android app ships pre-rendered pages inside the app
//            (www/*.html, built by scripts/build-app.mjs); URLs become /map.html.
//
// Everything degrades to a normal full page load on any error.
(function (global) {
  'use strict';

  var NATIVE = !!global.HUFRA_NATIVE_BUNDLE;
  var WEB_PATHS = /^\/(?:map|report|transparency|trust|account)?$|^\/pothole\/\d+$/;
  var NATIVE_ONLY = /^\/(?:login|register|admin)$/;
  var KEEP_ALIVE = { '/map': true };
  var CACHE_TTL = 30000;

  var loadedAssets = {};
  var htmlCache = {};
  var htmlCacheKeys = [];
  var keptPages = {};
  var scrollById = {};
  var current = null;
  var navToken = 0;
  var stateId = 0;

  Array.prototype.forEach.call(document.querySelectorAll('script[src]'), function (s) { loadedAssets[assetKey(s.getAttribute('src'))] = true; });
  Array.prototype.forEach.call(document.querySelectorAll('link[rel="stylesheet"]'), function (l) { loadedAssets[assetKey(l.getAttribute('href'))] = true; });

  function assetKey(src) { return String(src || '').split('?')[0]; }

  // ------------------------------------------------------------------ URLs
  function sameOrigin(a) {
    return a.protocol === global.location.protocol && a.host === global.location.host;
  }

  function eligible(path) {
    return WEB_PATHS.test(path) || (NATIVE && NATIVE_ONLY.test(path));
  }

  // Map the browser location back to the logical route (/map, /pothole/5).
  function logicalFromLocation() {
    var path = global.location.pathname;
    var search = global.location.search;
    if (!NATIVE) return { path: path, search: search };
    if (path === '/' || path === '/index.html') return { path: '/', search: search };
    var m = path.match(/^\/([a-z]+)\.html$/);
    if (!m) return { path: path, search: search };
    if (m[1] === 'pothole') {
      var id = new URLSearchParams(search).get('id');
      return { path: '/pothole/' + (id || ''), search: '' };
    }
    return { path: '/' + m[1], search: search };
  }

  function historyUrl(path, search) {
    if (!NATIVE) return path + (search || '');
    if (path === '/') return '/index.html' + (search || '');
    var m = path.match(/^\/pothole\/(\d+)$/);
    if (m) return '/pothole.html?id=' + m[1];
    return path + '.html' + (search || '');
  }

  function parseTarget(href) {
    var a = document.createElement('a');
    a.href = href;
    if (!sameOrigin(a)) return null;
    var path = a.pathname;
    var search = a.search || '';
    if (NATIVE) {
      // Accept both logical (/map) and file-style (/map.html) targets.
      var m = path.match(/^\/([a-z]+)\.html$/);
      if (m) path = m[1] === 'index' ? '/' : '/' + m[1];
    }
    if (path.length > 1) path = path.replace(/\/+$/, '');
    if (!eligible(path)) return null;
    return { path: path, search: search };
  }

  // ----------------------------------------------------------- page source
  function fetchHtml(path) {
    // Native: every /pothole/:id shares one bundled template (pothole.html).
    var url = NATIVE ? historyUrl(path, '').split('?')[0] : path;
    var hit = htmlCache[url];
    if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.promise;
    var p = fetch(url, { headers: { Accept: 'text/html' }, credentials: 'same-origin' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    });
    htmlCache[url] = { ts: Date.now(), promise: p };
    htmlCacheKeys.push(url);
    if (htmlCacheKeys.length > 12) delete htmlCache[htmlCacheKeys.shift()];
    p.catch(function () { delete htmlCache[url]; });
    return p;
  }

  function prefetch(href) {
    var t = parseTarget(href);
    if (!t || !current) return;
    if (keptPages[t.path]) return;
    fetchHtml(t.path).catch(function () {});
  }

  // ---------------------------------------------------------------- assets
  function loadScript(src, attrs) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.async = false;
      if (attrs && attrs.defer) s.defer = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('script failed: ' + src)); };
      s.src = src;
      document.body.appendChild(s);
    });
  }

  function runInline(code) {
    var s = document.createElement('script');
    s.text = code;
    document.body.appendChild(s);
    s.parentNode.removeChild(s);
  }

  function ensureStyles(doc) {
    Array.prototype.forEach.call(doc.querySelectorAll('link[rel="stylesheet"]'), function (l) {
      var href = l.getAttribute('href');
      if (loadedAssets[assetKey(href)]) return;
      loadedAssets[assetKey(href)] = true;
      var el = document.createElement('link');
      el.rel = 'stylesheet';
      el.href = href;
      document.head.appendChild(el);
    });
  }

  function ensureShared(doc, token) {
    var list = Array.prototype.filter.call(doc.querySelectorAll('script[src][data-shared]'), function (s) {
      return !loadedAssets[assetKey(s.getAttribute('src'))];
    });
    var chain = Promise.resolve();
    list.forEach(function (s) {
      chain = chain.then(function () {
        if (token !== navToken) return null;
        var src = s.getAttribute('src');
        loadedAssets[assetKey(src)] = true;
        return loadScript(src);
      });
    });
    return chain;
  }

  // Page scripts register DOMContentLoaded handlers; the document is already
  // loaded so capture those handlers and invoke them once the scripts ran.
  function runPageScripts(doc, token) {
    var queued = [];
    var orig = document.addEventListener;
    document.addEventListener = function (type, fn, opts) {
      if (type === 'DOMContentLoaded') queued.push(fn);
      else orig.call(document, type, fn, opts);
    };
    var scripts = Array.prototype.filter.call(doc.querySelectorAll('script'), function (s) {
      return !s.hasAttribute('data-shared') && !s.hasAttribute('data-boot');
    });
    var chain = Promise.resolve();
    scripts.forEach(function (s) {
      chain = chain.then(function () {
        if (token !== navToken) return null;
        var src = s.getAttribute('src');
        if (src) return loadScript(src);
        runInline(s.textContent || '');
        return null;
      });
    });
    return chain.then(function () {
      document.addEventListener = orig;
      if (token !== navToken) return;
      queued.forEach(function (fn) {
        try { fn.call(document, new Event('DOMContentLoaded')); } catch (e) { console.error('[router] page init failed', e); }
      });
    }, function (err) {
      document.addEventListener = orig;
      throw err;
    });
  }

  // ------------------------------------------------------------------ swap
  function syncActive(doc) {
    var selectors = '.main-nav a[href], .mobile-nav-panel a[href], .mobile-bottom-nav a[href]';
    Array.prototype.forEach.call(document.querySelectorAll(selectors), function (a) {
      var href = a.getAttribute('href');
      var other = doc.querySelector(selectors.split(',').map(function (s) { return s.trim() + '[href="' + href + '"]'; }).join(','));
      var active = !!(other && (other.hasAttribute('aria-current') || other.classList.contains('is-active')));
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      if (a.classList.contains('mobile-bottom-nav__item')) a.classList.toggle('is-active', active);
    });
  }

  function applyChrome(doc) {
    document.title = doc.title;
    var desc = doc.querySelector('meta[name="description"]');
    var curDesc = document.querySelector('meta[name="description"]');
    if (desc && curDesc) curDesc.setAttribute('content', desc.getAttribute('content'));
    document.body.className = doc.body.className;
    var newFooter = doc.querySelector('.site-footer');
    var oldFooter = document.querySelector('.site-footer');
    if (newFooter && oldFooter) oldFooter.replaceWith(document.importNode(newFooter, true));
    syncActive(doc);
  }

  function mainEl() { return document.getElementById('main-content'); }

  function stashCurrent() {
    if (!current) return;
    scrollById[current.id] = global.scrollY || 0;
    global.dispatchEvent(new CustomEvent('hufra:page-leave', { detail: { path: current.path } }));
    if (KEEP_ALIVE[current.path]) {
      var frag = document.createDocumentFragment();
      var main = mainEl();
      while (main.firstChild) frag.appendChild(main.firstChild);
      keptPages[current.path] = { frag: frag, doc: current.doc };
    }
  }

  function swap(fn) {
    var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !reduce) {
      try { return document.startViewTransition(fn).updateCallbackDone; } catch (e) { /* fall through */ }
    }
    fn();
    return Promise.resolve();
  }

  function afterSwap(path, search, id, restoreScroll) {
    if (global.HufraI18n) global.HufraI18n.translatePage(document);
    if (global.lucide) global.lucide.createIcons();
    if (global.HufraUI && global.HufraUI.closeMenu) global.HufraUI.closeMenu();
    global.scrollTo(0, restoreScroll ? (scrollById[id] || 0) : 0);
  }

  function fallback(path, search) {
    global.location.href = historyUrl(path, search);
  }

  // ------------------------------------------------------------------ core
  function navigate(path, search, opts) {
    opts = opts || {};
    search = search || '';
    var token = ++navToken;
    var kept = keptPages[path];
    var id = opts.id;

    if (current && current.path === path && KEEP_ALIVE[path] && !opts.force) {
      // Already showing this kept page: only the query changed.
      if (opts.push !== false) {
        stateId += 1;
        current.id = stateId;
        global.history.pushState({ hufra: true, id: stateId }, '', historyUrl(path, search));
      }
      global.dispatchEvent(new CustomEvent('hufra:page-show', { detail: { path: path, search: search } }));
      return Promise.resolve();
    }

    function commitHistory() {
      if (opts.push === false) return;
      stateId += 1;
      id = stateId;
      var fn = opts.replace ? 'replaceState' : 'pushState';
      global.history[fn]({ hufra: true, id: id }, '', historyUrl(path, search));
    }

    if (kept) {
      stashCurrent();
      commitHistory();
      return swap(function () {
        applyChrome(kept.doc);
        var main = mainEl();
        while (main.firstChild) main.removeChild(main.firstChild);
        main.appendChild(kept.frag);
        delete keptPages[path];
      }).then(function () {
        if (token !== navToken) return;
        current = { path: path, id: id || stateId, doc: kept.doc };
        afterSwap(path, search, current.id, opts.push === false);
        global.dispatchEvent(new CustomEvent('hufra:page-show', { detail: { path: path, search: search } }));
        global.dispatchEvent(new CustomEvent('hufra:navigated', { detail: { path: path, search: search } }));
      });
    }

    return fetchHtml(path).then(function (html) {
      if (token !== navToken) return null;
      var doc = new DOMParser().parseFromString(html, 'text/html');
      ensureStyles(doc);
      return ensureShared(doc, token).then(function () {
        if (token !== navToken) return null;
        stashCurrent();
        commitHistory();
        return swap(function () {
          applyChrome(doc);
          var main = mainEl();
          var src = doc.getElementById('main-content');
          while (main.firstChild) main.removeChild(main.firstChild);
          Array.prototype.forEach.call(src.childNodes, function (n) { main.appendChild(document.importNode(n, true)); });
        }).then(function () {
          if (token !== navToken) return null;
          current = { path: path, id: id || stateId, doc: doc };
          afterSwap(path, search, current.id, opts.push === false);
          return runPageScripts(doc, token).then(function () {
            if (token !== navToken) return;
            global.dispatchEvent(new CustomEvent('hufra:navigated', { detail: { path: path, search: search } }));
          });
        });
      });
    }).catch(function (err) {
      if (token !== navToken) return;
      console.warn('[router] falling back to full load', err);
      fallback(path, search);
    });
  }

  // Public: navigate to a logical path (with optional query). Non-routable
  // targets on the web are a normal full page load.
  function go(href, opts) {
    var t = parseTarget(href);
    if (!t) { global.location.href = href; return Promise.resolve(); }
    var cur = logicalFromLocation();
    if (t.path === cur.path && t.search === cur.search && !(opts && opts.force)) {
      global.scrollTo({ top: 0, behavior: 'smooth' });
      return Promise.resolve();
    }
    return navigate(t.path, t.search, opts);
  }

  function onClick(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var raw = a.getAttribute('href');
    if (!raw || raw.charAt(0) === '#' || a.hasAttribute('download') || a.hasAttribute('data-no-router')) return;
    if (a.target && a.target !== '_self') return;
    var t = parseTarget(a.href);
    if (!t) return;
    e.preventDefault();
    go(t.path + t.search);
  }

  function onPrefetchEvent(e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (a && a.getAttribute('href').charAt(0) !== '#') prefetch(a.href);
  }

  function init() {
    var cur = logicalFromLocation();
    var doc = document.cloneNode(true);
    current = { path: cur.path, id: 0, doc: doc };
    global.history.replaceState({ hufra: true, id: 0 }, '', global.location.href);
    if ('scrollRestoration' in global.history) global.history.scrollRestoration = 'manual';

    document.addEventListener('click', onClick);
    document.addEventListener('touchstart', onPrefetchEvent, { passive: true });
    document.addEventListener('mouseover', onPrefetchEvent, { passive: true });
    document.addEventListener('focusin', onPrefetchEvent);

    global.addEventListener('popstate', function (e) {
      var loc = logicalFromLocation();
      if (!eligible(loc.path)) { global.location.reload(); return; }
      var id = e.state && e.state.hufra ? e.state.id : undefined;
      navigate(loc.path, loc.search, { push: false, id: id });
    });

    // Warm the main tabs when idle (skipped on Data Saver / slow links).
    var conn = navigator.connection || {};
    var slow = conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '');
    if (!slow && !NATIVE) {
      var idle = global.requestIdleCallback || function (fn) { return setTimeout(fn, 1500); };
      idle(function () {
        ['/map', '/report', '/transparency', '/account'].forEach(function (p) {
          if (p !== cur.path) prefetch(p);
        });
      });
    }
  }

  global.HufraRouter = { go: go, prefetch: prefetch, isNative: NATIVE, eligible: eligible };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
