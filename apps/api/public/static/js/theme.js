// Theme (light/dark) and text-size (elderly-friendly) preferences.
// The early boot script in the layout applies these before first paint; this
// module keeps them in sync afterwards and notifies listeners (status bar,
// map pins, segmented controls).
(function (global) {
  'use strict';

  var THEME_COLORS = { light: '#FFFFFF', dark: '#15181C' };
  var listeners = [];

  function getTheme() {
    var stored = localStorage.getItem('hufra_theme');
    if (stored) return stored;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.getElementById('meta-theme-color');
    if (meta) meta.setAttribute('content', THEME_COLORS[theme] || THEME_COLORS.light);
  }

  function setTheme(theme) {
    localStorage.setItem('hufra_theme', theme);
    applyTheme(theme);
    notify();
  }

  function toggleTheme() {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark');
  }

  function getFontSize() {
    return localStorage.getItem('hufra_font_size') || 'base';
  }

  function setFontSize(size) {
    localStorage.setItem('hufra_font_size', size);
    if (size === 'base') {
      document.documentElement.removeAttribute('data-font-size');
    } else {
      document.documentElement.setAttribute('data-font-size', size);
    }
    notify();
  }

  function cycleFontSize() {
    var order = ['base', 'large', 'xlarge'];
    var next = order[(order.indexOf(getFontSize()) + 1) % order.length];
    setFontSize(next);
    return next;
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  function notify() {
    listeners.forEach(function (fn) {
      try { fn({ theme: getTheme(), fontSize: getFontSize() }); } catch (e) {}
    });
  }

  applyTheme(getTheme());

  global.HufraTheme = {
    getTheme: getTheme,
    setTheme: setTheme,
    toggleTheme: toggleTheme,
    getFontSize: getFontSize,
    setFontSize: setFontSize,
    cycleFontSize: cycleFontSize,
    onChange: onChange,
  };
})(window);
