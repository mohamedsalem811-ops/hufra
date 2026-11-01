// Runs in <head>, before the stylesheets apply, so the page is painted in the
// right theme, language direction and font size from the first frame.
// Kept as a file (not an inline script) so the Content-Security-Policy can
// forbid inline scripts entirely: script-src 'self'.
(function(){try{
var d=document.documentElement,ls=window.localStorage;
var t=ls.getItem('hufra_theme')||((window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light');
d.setAttribute('data-theme',t);
var l=ls.getItem('hufra_locale')||'ar';d.setAttribute('lang',l);d.setAttribute('dir',l==='ar'?'rtl':'ltr');
var f=ls.getItem('hufra_font_size');if(f&&f!=='base')d.setAttribute('data-font-size',f);
var C=window.Capacitor,native=!!(C&&C.isNativePlatform&&C.isNativePlatform());
var standalone=!!(navigator.standalone||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches));
if(native||standalone)d.classList.add('is-app');
if(native){d.classList.add('is-native');d.classList.add('platform-'+(C.getPlatform?C.getPlatform():'native'));}
var m=document.getElementById('meta-theme-color');if(m)m.setAttribute('content',t==='dark'?'#15181C':'#FFFFFF');
}catch(e){}})();
