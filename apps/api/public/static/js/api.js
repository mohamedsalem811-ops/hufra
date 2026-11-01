// Fetch wrapper for the HUFRA API.
//
// Two ways of carrying the session:
//  - Website: HttpOnly cookies only. The server never sends the tokens to a
//    web page and this file never stores them, so script injected into a page
//    cannot read or steal a session (see tokensInBody in src/lib/origins.ts).
//  - Native app (Capacitor bundle): Bearer access token + refresh token kept
//    in the app's storage, because the app's own origin (capacitor://localhost)
//    cannot use the site's cookies.
(function (global) {
  'use strict';

  var ACCESS_TOKEN_KEY = 'hufra_access_token';
  var REFRESH_TOKEN_KEY = 'hufra_refresh_token';

  function isNative() {
    return Boolean(
      global.HUFRA_NATIVE_BUNDLE ||
      (global.Capacitor && typeof global.Capacitor.isNativePlatform === 'function' && global.Capacitor.isNativePlatform())
    );
  }
  var TOKEN_MODE = isNative();

  function store() {
    try { return global.localStorage; } catch (e) { return null; }
  }

  // Older versions of the website kept tokens in localStorage: remove them.
  if (!TOKEN_MODE) {
    try {
      var ls = store();
      if (ls) { ls.removeItem(ACCESS_TOKEN_KEY); ls.removeItem(REFRESH_TOKEN_KEY); }
    } catch (e) { /* storage unavailable */ }
  }

  function getApiBase() {
    var ls = store();
    return global.HUFRA_API_BASE || (ls && ls.getItem('hufra_api_base')) || '';
  }

  // Absolute origin that serves /media/* (R2 proxy). Empty on the website
  // (same origin); the bundled native app points it at the production API.
  function mediaBase() {
    return getApiBase();
  }

  function getAccessToken() {
    var ls = TOKEN_MODE && store();
    return ls ? ls.getItem(ACCESS_TOKEN_KEY) : null;
  }

  function getRefreshToken() {
    var ls = TOKEN_MODE && store();
    return ls ? ls.getItem(REFRESH_TOKEN_KEY) : null;
  }

  function setTokens(accessToken, refreshToken) {
    var ls = TOKEN_MODE && store();
    if (!ls) return; // website: the session lives in HttpOnly cookies
    if (accessToken) ls.setItem(ACCESS_TOKEN_KEY, accessToken);
    else ls.removeItem(ACCESS_TOKEN_KEY);
    if (refreshToken) ls.setItem(REFRESH_TOKEN_KEY, refreshToken);
    else if (!accessToken) ls.removeItem(REFRESH_TOKEN_KEY);
  }

  /** Clear the stored session (logout). Passing a token is kept for compatibility. */
  function setAccessToken(token) {
    if (token) setTokens(token, getRefreshToken());
    else setTokens(null, null);
  }

  /** True when a session may exist, so a refresh attempt is worthwhile. */
  function maySessionExist() {
    if (TOKEN_MODE) return !!getRefreshToken();
    return /(?:^|;\s*)hufra_auth=1/.test(document.cookie || '');
  }

  function buildHeaders(extra, isJson) {
    var headers = Object.assign({}, extra || {});
    var token = getAccessToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (isJson) headers['Content-Type'] = 'application/json';
    return headers;
  }

  async function request(path, options) {
    options = options || {};
    var isJson = options.body !== undefined && options.body !== null && !(options.body instanceof FormData);
    var sentGeneration = refreshGeneration;
    var headers = buildHeaders(options.headers, isJson);
    if (options.headers && options.headers.Authorization) {
      headers.Authorization = options.headers.Authorization;
    }
    var res = await fetch(getApiBase() + '/api' + path, {
      method: options.method || 'GET',
      headers: headers,
      body: isJson ? JSON.stringify(options.body) : options.body,
      credentials: 'include',
    });

    if (res.status === 401 && !options._retried && path !== '/auth/login' && path !== '/auth/refresh') {
      // If another request already refreshed while this one was in flight,
      // just retry with the new access token instead of refreshing again.
      var refreshed = refreshGeneration !== sentGeneration || (maySessionExist() && (await tryRefresh()));
      if (refreshed) {
        return request(path, Object.assign({}, options, { _retried: true }));
      }
    }

    var data = null;
    var text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }

    if (!res.ok) {
      var error = new Error((data && (data.error_ar || data.error)) || 'Request failed');
      error.status = res.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  // Refresh tokens are single-use (the server rotates them), so parallel 401s
  // must share ONE refresh call instead of each spending the same token.
  var refreshInFlight = null;
  // Incremented after every successful refresh (cookie or token mode).
  var refreshGeneration = 0;

  function tryRefresh() {
    if (!refreshInFlight) {
      refreshInFlight = doRefresh().finally(function () { refreshInFlight = null; });
    }
    return refreshInFlight;
  }

  async function doRefresh() {
    try {
      var refreshToken = getRefreshToken();
      var headers = { 'Content-Type': 'application/json' };
      if (refreshToken) headers['X-Refresh-Token'] = refreshToken;
      var res = await fetch(getApiBase() + '/api/auth/refresh', {
        method: 'POST',
        headers: headers,
        body: '{}',
        credentials: 'include',
      });
      if (!res.ok) {
        if (res.status === 401) setTokens(null, null);
        return false;
      }
      var data = await res.json();
      if (TOKEN_MODE && data.access_token) setTokens(data.access_token, data.refresh_token || refreshToken);
      refreshGeneration++;
      return true;
    } catch (e) {
      return false;
    }
  }

  global.HufraApi = {
    get: function (path, headers) { return request(path, { headers: headers }); },
    post: function (path, body, headers) { return request(path, { method: 'POST', body: body, headers: headers }); },
    patch: function (path, body, headers) { return request(path, { method: 'PATCH', body: body, headers: headers }); },
    del: function (path, bodyOrHeaders) {
      var isBody = bodyOrHeaders && typeof bodyOrHeaders === 'object' && !bodyOrHeaders.Authorization;
      return request(path, {
        method: 'DELETE',
        body: isBody ? bodyOrHeaders : undefined,
        headers: isBody ? undefined : bodyOrHeaders,
      });
    },
    postForm: function (path, formData) { return request(path, { method: 'POST', body: formData }); },
    getAccessToken: getAccessToken,
    setAccessToken: setAccessToken,
    getRefreshToken: getRefreshToken,
    setTokens: setTokens,
    getApiBase: getApiBase,
    mediaBase: mediaBase,
    usesTokens: function () { return TOKEN_MODE; },
  };
})(window);
