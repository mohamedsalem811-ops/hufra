// Fetch wrapper for the HUFRA API supporting both web (HttpOnly cookies +
// localStorage access token) and Capacitor mobile apps (Bearer access token +
// persistent refresh token in storage / X-Refresh-Token header).
(function (global) {
  'use strict';

  var ACCESS_TOKEN_KEY = 'hufra_access_token';
  var REFRESH_TOKEN_KEY = 'hufra_refresh_token';

  function getApiBase() {
    return global.HUFRA_API_BASE || localStorage.getItem('hufra_api_base') || '';
  }

  // Absolute origin that serves /media/* (R2 proxy). Empty on the website
  // (same origin); the bundled native app points it at the production API.
  function mediaBase() {
    return getApiBase();
  }

  function getAccessToken() {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  function setAccessToken(token) {
    if (token) {
      localStorage.setItem(ACCESS_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  }

  function getRefreshToken() {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  function setTokens(accessToken, refreshToken) {
    if (accessToken) {
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    } else {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
    }
    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    } else if (!accessToken) {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
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
      var refreshed = await tryRefresh();
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

  async function tryRefresh() {
    try {
      var refreshToken = getRefreshToken();
      var headers = { 'Content-Type': 'application/json' };
      if (refreshToken) {
        headers['X-Refresh-Token'] = refreshToken;
      }
      var res = await fetch(getApiBase() + '/api/auth/refresh', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(refreshToken ? { refresh_token: refreshToken } : {}),
        credentials: 'include',
      });
      if (!res.ok) return false;
      var data = await res.json();
      setTokens(data.access_token, data.refresh_token || refreshToken);
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
  };
})(window);
