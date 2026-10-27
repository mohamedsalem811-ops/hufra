// Theme (light/dark) and font-size (elderly-friendly) toggles.
(function (global) {
  'use strict';

  function getTheme() {
    var stored = localStorage.getItem('hufra_theme');
    if (stored) return stored;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function setTheme(theme) {
    localStorage.setItem('hufra_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
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
  }

  function cycleFontSize() {
    var order = ['base', 'large', 'xlarge'];
    var current = order.indexOf(getFontSize());
    var next = order[(current + 1) % order.length];
    setFontSize(next);
    return next;
  }

  // Apply immediately to avoid flash of wrong theme.
  setTheme(getTheme());
  if (getFontSize() !== 'base') setFontSize(getFontSize());

  global.HufraTheme = {
    getTheme: getTheme,
    setTheme: setTheme,
    toggleTheme: toggleTheme,
    getFontSize: getFontSize,
    setFontSize: setFontSize,
    cycleFontSize: cycleFontSize,
  };
})(window);
