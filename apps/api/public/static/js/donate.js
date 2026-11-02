/* Donation pages (plan 6.9): campaign, bank transfer steps, proof upload, my donations.
 * Vanilla JS, no inline scripts (CSP). Every value from the API is inserted as
 * text (textContent), never as HTML. Amounts are shown in Libyan dinar. */
(function () {
  'use strict';

  var STR = {
    ar: {
      loading: 'نحمّل…',
      'nav.mine': 'تبرعاتي',
      'foot.privacy': 'الأمان والخصوصية',
      lyd: 'د.ل',
      'err.generic': 'تعذّر الوصول الآن. تحقق من الإنترنت وحاول مرة أخرى.',
      'err.notFound': 'لم نجد هذه الصفحة. ربما أُغلقت الحملة.',
      retry: 'حاول مرة أخرى',
      back: 'رجوع',
      'status.active': 'الحملة مفتوحة',
      'status.funded': 'اكتمل التمويل',
      'status.completed': 'تم الإصلاح',
      'status.cancelled': 'أُلغيت الحملة',
      'campaign.title': 'حملة إصلاح',
      'campaign.of': '{a} مؤكدة من {b}',
      'campaign.confirmed': '{a} مؤكدة',
      'campaign.review': '{a} قيد المراجعة، غير مؤكدة بعد',
      'campaign.donors': '{n} متبرع',
      'campaign.donor1': 'متبرع واحد',
      'campaign.left': 'يبقى {a}',
      'campaign.use': 'تُنفق التبرعات على إصلاح هذه الحفرة. ما يزيد ينتقل إلى الحملة المفتوحة التالية.',
      'campaign.donate': 'تبرّع لإصلاحها',
      'campaign.closedFunded': 'اكتمل تمويل هذا الإصلاح، شكراً لكل المتبرعين. سنخبرهم عند انتهاء الإصلاح.',
      'campaign.closedDone': 'أُصلحت هذه الحفرة بفضل المتبرعين.',
      'campaign.closedCancelled': 'أُلغيت هذه الحملة. انتقلت التبرعات إلى الحملة المفتوحة التالية.',
      'campaign.wall': 'المتبرعون',
      'campaign.anon': 'متبرع',
      'campaign.noDonors': 'كن أول من يتبرع لهذا الإصلاح.',
      'campaign.report': 'صفحة البلاغ',
      'campaign.notOpen': 'التبرعات غير متاحة بعد. عد قريباً.',
      'amount.title': 'كم تريد أن تتبرع؟',
      'amount.custom': 'مبلغ آخر',
      'amount.quick': 'مبالغ سريعة',
      'amount.hint': 'من {min} إلى {max}',
      'amount.showName': 'أظهر اسمي بين المتبرعين',
      'amount.showNameHint': 'وإلا يظهر تبرعك باسم «متبرع».',
      'method.title': 'طريقة الدفع',
      'method.bank': 'تحويل مصرفي (LYPAY أو تحويل داخلي)',
      'method.card': 'بطاقة مصرفية (معاملات)',
      'method.soon': 'قريباً',
      'amount.next': 'متابعة',
      'amount.invalid': 'اكتب مبلغاً بين {min} و{max} دينار.',
      'signin.title': 'سجّل الدخول لتتبرع',
      'signin.body': 'الحساب يتيح لنا تأكيد تبرعك وإخبارك عند وصوله وعند إصلاح الحفرة.',
      'signin.button': 'تسجيل الدخول',
      'signin.create': 'إنشاء حساب',
      'step1.title': 'التحويل',
      'step2.title': 'إثبات التحويل',
      'step.of': 'الخطوة {a} من 2',
      'step1.s1': 'انسخ بيانات الحساب ورمز التبرع.',
      'step1.s2': 'حوّل من تطبيق مصرفك: داخلياً إن كان حسابك في نفس المصرف، أو عبر LYPAY. اكتب الرمز في الملاحظة.',
      'step1.s3': 'ارجع هنا وارفع صورة التحويل.',
      'bank.holder': 'اسم صاحب الحساب',
      'bank.name': 'المصرف',
      'bank.account': 'رقم الحساب · لعملاء نفس المصرف (تحويل داخلي)',
      'bank.iban': 'IBAN · من أي مصرف آخر عبر LYPAY',
      'bank.code': 'رمز التبرع، اكتبه في ملاحظة التحويل',
      'bank.amount': 'المبلغ',
      copy: 'نسخ',
      copied: 'نُسخ',
      'step1.until': 'نحفظ تبرعك حتى {d}.',
      'step1.done': 'حوّلت المبلغ، التالي',
      'step1.later': 'سأحوّل لاحقاً (نحفظه 48 ساعة)',
      'step1.cancel': 'إلغاء هذا التبرع',
      'step1.cancelConfirm': 'إلغاء هذا التبرع؟ لن يُحتسب أي مبلغ.',
      'step2.amount': 'كم حوّلت؟',
      'step2.shot': 'صورة التحويل',
      'step2.pick': 'اختر صورة التحويل من الصور',
      'step2.added': 'تمت إضافة الصورة، صُغّرت إلى {kb} ك.ب',
      'step2.replace': 'استبدال',
      'step2.private': 'لا يرى الصورة إلا فريق المراجعة.',
      'step2.submit': 'إرسال للمراجعة',
      'step2.sending': 'نرسل…',
      'step2.needShot': 'أضف صورة التحويل أولاً.',
      'step2.badImage': 'تعذّرت قراءة هذه الصورة. جرّب لقطة شاشة أخرى.',
      'thanks.title': 'شكراً! وصلنا إثبات تبرعك',
      'thanks.body': 'يراجع الفريق التحويل مع كشف الحساب، وسنخبرك عند تأكيده. بعد التأكيد يُضاف المبلغ إلى هدف الحملة.',
      'thanks.replace': 'استبدال صورة التحويل',
      'd.amount': 'المبلغ',
      'd.campaign': 'الحملة',
      'd.code': 'الرمز',
      'd.status': 'الحالة',
      'd.date': 'التاريخ',
      'd.back': 'العودة إلى البلاغ',
      'ds.awaiting_transfer': 'بانتظار صورة التحويل',
      'ds.under_review': 'قيد المراجعة · غير مؤكد',
      'ds.confirmed': 'مؤكد',
      'ds.rejected': 'تعذّر التحقق',
      'ds.expired': 'انتهت المهلة',
      'ds.cancelled': 'أُلغي',
      'receipt.title': 'إيصال تبرع',
      'receipt.thanks': 'وصل تبرعك وأُضيف إلى هدف الحملة. شكراً لأنك تساعد في إصلاح طرق مدينتك.',
      'receipt.print': 'طباعة أو حفظ PDF',
      'rejected.body': 'لم نجد هذا التحويل في كشف الحساب. إذا حوّلت فعلاً، راسلنا وسنراجعه معك.',
      'rejected.reason': 'السبب: {r}',
      contact: 'تواصل معنا',
      'again': 'تبرّع مجدداً',
      'expired.body': 'لم تصلنا صورة التحويل خلال 48 ساعة، فأغلقنا هذا التبرع. يمكنك البدء من جديد.',
      'cancelled.body': 'ألغيت هذا التبرع.',
      'mine.title': 'تبرعاتي',
      'mine.total': 'تبرعاتك المؤكدة',
      'mine.empty': 'لا تبرعات بعد. اختر حفرة على الخريطة وساهم في إصلاحها.',
      'mine.map': 'افتح الخريطة',
      'mine.ends': 'ينتهي خلال {h} ساعة',
      'mine.continue': 'إكمال التبرع',
      'mine.signin': 'سجّل الدخول لترى تبرعاتك.',
      unknownStreet: 'شارع غير مسمّى',
    },
    en: {
      loading: 'Loading…',
      'nav.mine': 'My donations',
      'foot.privacy': 'Security and privacy',
      lyd: 'LYD',
      'err.generic': "We can't reach the service right now. Check your connection and try again.",
      'err.notFound': "We couldn't find this page. The campaign may have closed.",
      retry: 'Try again',
      back: 'Back',
      'status.active': 'Campaign open',
      'status.funded': 'Fully funded',
      'status.completed': 'Repaired',
      'status.cancelled': 'Campaign cancelled',
      'campaign.title': 'Repair campaign',
      'campaign.of': '{a} confirmed of {b}',
      'campaign.confirmed': '{a} confirmed',
      'campaign.review': '{a} under review, not yet confirmed',
      'campaign.donors': '{n} donors',
      'campaign.donor1': '1 donor',
      'campaign.left': '{a} to go',
      'campaign.use': 'Donations pay for repairing this pothole. Anything left over goes to the next open campaign.',
      'campaign.donate': 'Donate to repair it',
      'campaign.closedFunded': 'This repair is fully funded. Thank you to every donor; we will tell them when the work is done.',
      'campaign.closedDone': 'This pothole was repaired thanks to its donors.',
      'campaign.closedCancelled': 'This campaign was cancelled. Its donations moved to the next open campaign.',
      'campaign.wall': 'Donors',
      'campaign.anon': 'A donor',
      'campaign.noDonors': 'Be the first to donate to this repair.',
      'campaign.report': 'Report page',
      'campaign.notOpen': 'Donations are not open yet. Check back soon.',
      'amount.title': 'How much would you like to give?',
      'amount.custom': 'Other amount',
      'amount.quick': 'Quick amounts',
      'amount.hint': 'From {min} to {max}',
      'amount.showName': 'Show my name among the donors',
      'amount.showNameHint': 'Otherwise your donation shows as "A donor".',
      'method.title': 'Payment method',
      'method.bank': 'Bank transfer (LYPAY or same-bank)',
      'method.card': 'Bank card (Moamalat)',
      'method.soon': 'Coming soon',
      'amount.next': 'Continue',
      'amount.invalid': 'Enter an amount between {min} and {max} dinar.',
      'signin.title': 'Sign in to donate',
      'signin.body': 'An account lets us confirm your donation and tell you when it arrives and when the pothole is fixed.',
      'signin.button': 'Sign in',
      'signin.create': 'Create an account',
      'step1.title': 'Transfer',
      'step2.title': 'Proof of transfer',
      'step.of': 'Step {a} of 2',
      'step1.s1': 'Copy the account details and your donation code.',
      'step1.s2': 'Transfer from your banking app: internally if you bank with the same bank, otherwise through LYPAY. Put the code in the transfer note.',
      'step1.s3': 'Come back here and upload a screenshot of the transfer.',
      'bank.holder': 'Account holder',
      'bank.name': 'Bank',
      'bank.account': 'Account number · same-bank customers (internal transfer)',
      'bank.iban': 'IBAN · from any other bank through LYPAY',
      'bank.code': 'Donation code: write it in the transfer note',
      'bank.amount': 'Amount',
      copy: 'Copy',
      copied: 'Copied',
      'step1.until': 'We keep your donation open until {d}.',
      'step1.done': "I've transferred it, next",
      'step1.later': "I'll transfer later (kept for 48 hours)",
      'step1.cancel': 'Cancel this donation',
      'step1.cancelConfirm': 'Cancel this donation? Nothing will be counted.',
      'step2.amount': 'How much did you transfer?',
      'step2.shot': 'Transfer screenshot',
      'step2.pick': 'Choose the transfer screenshot from your photos',
      'step2.added': 'Screenshot added, reduced to {kb} KB',
      'step2.replace': 'Replace',
      'step2.private': 'Only the review team can see this image.',
      'step2.submit': 'Send for review',
      'step2.sending': 'Sending…',
      'step2.needShot': 'Add the transfer screenshot first.',
      'step2.badImage': "We couldn't read this image. Try another screenshot.",
      'thanks.title': 'Thank you! We received your proof',
      'thanks.body': 'The team checks the transfer against the bank statement and will tell you when it is confirmed. Once confirmed, it counts towards the campaign.',
      'thanks.replace': 'Replace the transfer screenshot',
      'd.amount': 'Amount',
      'd.campaign': 'Campaign',
      'd.code': 'Code',
      'd.status': 'Status',
      'd.date': 'Date',
      'd.back': 'Back to the report',
      'ds.awaiting_transfer': 'Waiting for the transfer screenshot',
      'ds.under_review': 'Under review · not yet confirmed',
      'ds.confirmed': 'Confirmed',
      'ds.rejected': "Couldn't verify",
      'ds.expired': 'Expired',
      'ds.cancelled': 'Cancelled',
      'receipt.title': 'Donation receipt',
      'receipt.thanks': 'Your donation arrived and counts towards the campaign. Thank you for helping fix your city’s roads.',
      'receipt.print': 'Print or save as PDF',
      'rejected.body': "We couldn't find this transfer in the bank statement. If you did transfer it, message us and we'll check it with you.",
      'rejected.reason': 'Reason: {r}',
      contact: 'Contact us',
      again: 'Donate again',
      'expired.body': "We didn't receive the transfer screenshot within 48 hours, so this donation was closed. You can start again.",
      'cancelled.body': 'You cancelled this donation.',
      'mine.title': 'My donations',
      'mine.total': 'Your confirmed donations',
      'mine.empty': 'No donations yet. Pick a pothole on the map and help repair it.',
      'mine.map': 'Open the map',
      'mine.ends': 'Ends in {h} h',
      'mine.continue': 'Finish donating',
      'mine.signin': 'Sign in to see your donations.',
      unknownStreet: 'Unnamed street',
    },
  };

  var LIMITS = { min: 1, max: 100000, proofBytes: 550 * 1024, proofEdge: 1600 };
  var QUICK = [10, 25, 50, 100];

  // ------------------------------------------------------------ language
  var lang = 'ar';
  try {
    var q = new URLSearchParams(location.search).get('lang');
    lang = q === 'en' || q === 'ar' ? q : localStorage.getItem('hufra.donate.lang') === 'en' ? 'en' : 'ar';
  } catch (e) { /* storage unavailable: Arabic */ }

  function t(key, vars) {
    var s = (STR[lang] && STR[lang][key]) || STR.ar[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(String(vars[k])); });
    return s;
  }

  function applyLang() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach(function (n) { n.textContent = t(n.getAttribute('data-i18n')); });
    var toggle = document.getElementById('lang-toggle');
    if (toggle) {
      toggle.textContent = lang === 'ar' ? 'English' : 'العربية';
      toggle.lang = lang === 'ar' ? 'en' : 'ar';
    }
  }

  // ------------------------------------------------------------ helpers
  /** el('div', {class: 'x'}, 'text', child) - strings become text nodes. */
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === undefined || v === null || v === false) return;
        if (k === 'class') node.className = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : String(v));
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return node;
  }

  function lyd(n) {
    var num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(n);
    return lang === 'ar' ? num + ' ' + t('lyd') : t('lyd') + ' ' + num;
  }

  function date(iso, withTime) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var opts = { day: 'numeric', month: 'long', year: 'numeric' };
    if (withTime) { opts.hour = '2-digit'; opts.minute = '2-digit'; }
    try { return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', opts).format(d); } catch (e) { return d.toISOString().slice(0, 10); }
  }

  function street(o) {
    var s = lang === 'ar' ? o.street_ar || o.street_en : o.street_en || o.street_ar;
    return (s && s.trim()) || t('unknownStreet');
  }

  var root = document.getElementById('app');
  function show() {
    root.textContent = '';
    for (var i = 0; i < arguments.length; i++) if (arguments[i]) root.appendChild(arguments[i]);
    window.scrollTo(0, 0);
  }

  function errorView(err, retry) {
    var msg = err && err.status === 404 ? t('err.notFound') : (err && (lang === 'ar' ? err.error_ar : err.error)) || t('err.generic');
    show(el('div', { class: 'notice err', role: 'alert' }, msg), retry ? el('button', { class: 'btn secondary', type: 'button', onclick: retry }, t('retry')) : null);
  }

  // ------------------------------------------------------------ API (cookie session, one refresh on 401)
  function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
    if (opts.form) init.body = opts.form;
    else if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    function go() {
      return fetch(path, init).then(function (res) {
        return res.text().then(function (txt) {
          var data = null;
          try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
          if (!res.ok) { var e2 = data || {}; e2.status = res.status; throw e2; }
          return data;
        });
      });
    }
    return go().catch(function (err) {
      if (err && err.status === 401 && !opts.noRefresh) {
        return fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' }).then(function (r) {
          if (!r.ok) throw err;
          return go();
        });
      }
      throw err;
    });
  }

  function me() {
    return api('/api/auth/me').then(function (d) { return d.user; }).catch(function (e) { if (e && e.status === 401) return null; throw e; });
  }

  function loginUrl() {
    return '/login?redirect=' + encodeURIComponent(location.pathname);
  }

  function copyButton(value) {
    var btn = el('button', { class: 'copy', type: 'button' }, t('copy'));
    btn.addEventListener('click', function () {
      var done = function () {
        btn.textContent = t('copied');
        setTimeout(function () { btn.textContent = t('copy'); }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(done, fallback);
      else fallback();
      function fallback() {
        var ta = el('textarea', { class: 'sr-only', readonly: true });
        ta.value = value;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
        ta.remove();
      }
    });
    return btn;
  }

  function row(label, value, opts) {
    opts = opts || {};
    return el('div', { class: 'row' },
      el('div', null, el('div', { class: 'label' }, label), el('div', { class: 'value' + (opts.ltr ? ' ltr' : '') + (opts.code ? ' code' : '') }, value)),
      opts.copy ? copyButton(opts.copy) : null);
  }

  function groupIban(iban) { return iban.replace(/(.{4})/g, '$1 ').trim(); }

  // ------------------------------------------------------------ image compression (canvas: also drops EXIF)
  function loadImage(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(file); }).catch(viaImg);
    }
    return viaImg();
    function viaImg() {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        var url = URL.createObjectURL(file);
        img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
        img.src = url;
      });
    }
  }

  function toBlob(canvas, q) {
    return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', q); });
  }

  function compress(file) {
    return loadImage(file).then(function (img) {
      var w = img.width, h = img.height;
      var edges = [LIMITS.proofEdge, 1280, 1000];
      var qualities = [0.85, 0.75, 0.65, 0.55];
      function attempt(ei, qi) {
        var scale = Math.min(1, edges[ei] / Math.max(w, h));
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return toBlob(canvas, qualities[qi]).then(function (blob) {
          if (blob && blob.size <= LIMITS.proofBytes) return blob;
          if (qi + 1 < qualities.length) return attempt(ei, qi + 1);
          if (ei + 1 < edges.length) return attempt(ei + 1, 0);
          throw new Error('too-large');
        });
      }
      return attempt(0, 0);
    });
  }

  // ------------------------------------------------------------ campaign page
  function progress(c) {
    var target = c.target_lyd || 1;
    var conf = Math.min(100, (c.confirmed_lyd / target) * 100);
    var rev = Math.min(100 - conf, (c.under_review_lyd / target) * 100);
    var bar = el('div', { class: 'bar', role: 'img', 'aria-label': t('campaign.of', { a: lyd(c.confirmed_lyd), b: lyd(c.target_lyd) }) },
      el('span', { class: 'confirmed', style: 'width:' + conf + '%' }),
      el('span', { class: 'review', style: 'width:' + rev + '%' }));
    var left = Math.max(0, c.target_lyd - c.confirmed_lyd);
    return el('div', { class: 'card' },
      el('h2', null, t('campaign.title')),
      el('div', { class: 'money' }, t('campaign.of', { a: lyd(c.confirmed_lyd), b: lyd(c.target_lyd) })),
      bar,
      el('div', { class: 'legend' },
        el('span', { class: 'l-confirmed' }, t('campaign.confirmed', { a: lyd(c.confirmed_lyd) })),
        c.under_review_lyd > 0 ? el('span', { class: 'l-review' }, t('campaign.review', { a: lyd(c.under_review_lyd) })) : null),
      el('div', { class: 'small secondary' }, (c.donors_count === 1 ? t('campaign.donor1') : t('campaign.donors', { n: c.donors_count })) + (c.status === 'active' && left > 0 ? ' · ' + t('campaign.left', { a: lyd(left) }) : '')),
      el('p', { class: 'small secondary', style: 'margin:0' }, (lang === 'ar' ? c.note_ar || c.note_en : c.note_en || c.note_ar) || t('campaign.use')));
  }

  function campaignPage(id) {
    Promise.all([api('/api/campaigns/' + id), api('/api/donations/config')]).then(function (res) {
      var data = res[0], config = res[1], c = data.campaign;
      return api('/api/potholes/' + c.pothole_id).catch(function () { return null; }).then(function (detail) {
        var photos = (detail && detail.photos) || [];
        var photo = photos.filter(function (p) { return p.stage === 'after'; }).pop() || photos.filter(function (p) { return p.stage !== 'after'; })[0];
        var hero = photo ? el('div', { class: 'hero' }, el('img', { src: '/media/' + photo.r2_key, alt: '', loading: 'eager' })) : null;
        var closed = c.status === 'funded' ? t('campaign.closedFunded') : c.status === 'completed' ? t('campaign.closedDone') : c.status === 'cancelled' ? t('campaign.closedCancelled') : null;
        var cta;
        if (closed) cta = el('div', { class: 'notice ok' }, closed);
        else if (!config.enabled) cta = el('div', { class: 'notice' }, t('campaign.notOpen'));
        else cta = el('button', { class: 'btn primary', type: 'button', onclick: function () { amountStep(c); } }, t('campaign.donate'));

        var wall = el('div', { class: 'card' }, el('h2', null, t('campaign.wall')));
        if (!data.donors.length) wall.appendChild(el('p', { class: 'muted', style: 'margin:0' }, t('campaign.noDonors')));
        else {
          var list = el('div', { class: 'list' });
          data.donors.forEach(function (d) {
            list.appendChild(el('div', { class: 'donor' }, el('span', null, d.name || t('campaign.anon')), el('span', { class: 'secondary' }, lyd(d.amount_lyd))));
          });
          wall.appendChild(list);
        }
        show(
          hero,
          el('span', { class: 'badge ' + c.status }, t('status.' + c.status)),
          el('h1', null, street(c)),
          el('p', { class: 'secondary', style: 'margin:0' }, lang === 'ar' ? c.region_name_ar : c.region_name_en),
          progress(c),
          cta,
          wall,
          el('a', { class: 'btn text', href: '/pothole/' + c.pothole_id }, t('campaign.report'))
        );
      });
    }).catch(function (err) { errorView(err, function () { campaignPage(id); }); });
  }

  function amountStep(c) {
    me().then(function (user) {
      if (!user) {
        show(el('div', { class: 'card' },
          el('h1', null, t('signin.title')),
          el('p', { class: 'secondary', style: 'margin:0' }, t('signin.body')),
          el('a', { class: 'btn primary', href: loginUrl() }, t('signin.button')),
          el('a', { class: 'btn text', href: '/register?redirect=' + encodeURIComponent(location.pathname) }, t('signin.create'))));
        return;
      }
      var amount = null;
      var input = el('input', { id: 'amount', type: 'number', inputmode: 'decimal', min: LIMITS.min, max: LIMITS.max, step: '0.001', 'aria-describedby': 'amount-hint' });
      var chips = el('div', { class: 'chips', role: 'group', 'aria-label': t('amount.quick') });
      QUICK.forEach(function (v) {
        var chip = el('button', { class: 'chip', type: 'button', 'aria-pressed': 'false' }, String(v));
        chip.addEventListener('click', function () { amount = v; input.value = String(v); sync(); });
        chips.appendChild(chip);
      });
      input.addEventListener('input', function () { amount = Number(input.value); sync(); });
      function sync() {
        chips.querySelectorAll('.chip').forEach(function (ch) { ch.setAttribute('aria-pressed', String(Number(ch.textContent) === amount)); });
      }
      var showName = el('input', { type: 'checkbox', id: 'show-name' });
      var error = el('div', { class: 'notice err', role: 'alert', hidden: true });
      var next = el('button', { class: 'btn primary', type: 'submit' }, t('amount.next'));
      var form = el('form', { class: 'card', novalidate: true },
        el('h1', null, t('amount.title')),
        chips,
        el('div', { class: 'field' },
          el('label', { for: 'amount' }, t('amount.custom')),
          el('div', { class: 'input-wrap' }, input, el('span', { class: 'secondary' }, t('lyd'))),
          el('span', { id: 'amount-hint', class: 'caption secondary' }, t('amount.hint', { min: lyd(LIMITS.min), max: lyd(LIMITS.max) }))),
        el('label', { class: 'check', for: 'show-name' }, showName, el('span', null, el('strong', null, t('amount.showName')), el('br'), el('span', { class: 'small secondary' }, t('amount.showNameHint')))),
        el('div', { class: 'field' },
          el('span', { class: 'label' }, el('strong', null, t('method.title'))),
          el('div', { class: 'method selected' }, el('span', null, '●'), el('span', null, t('method.bank'))),
          el('div', { class: 'method soon', 'aria-disabled': 'true' }, el('span', null, '○'), el('span', null, t('method.card') + ' · ' + t('method.soon')))),
        error,
        next);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var value = Number(input.value);
        if (!(value >= LIMITS.min && value <= LIMITS.max) || Math.abs(value * 1000 - Math.round(value * 1000)) > 1e-6) {
          error.hidden = false;
          error.textContent = t('amount.invalid', { min: LIMITS.min, max: LIMITS.max });
          input.focus();
          return;
        }
        next.disabled = true;
        api('/api/campaigns/' + c.id + '/donations', { method: 'POST', body: { amount_lyd: value, show_name: showName.checked, method: 'bank_transfer' } })
          .then(function (res) { location.href = '/donations/' + res.donation.id; })
          .catch(function (err) {
            next.disabled = false;
            error.hidden = false;
            error.textContent = (err && (lang === 'ar' ? err.error_ar : err.error)) || t('err.generic');
          });
      });
      show(form, el('button', { class: 'btn text', type: 'button', onclick: function () { campaignPage(c.id); } }, t('back')));
      input.focus();
    }).catch(function (err) { errorView(err); });
  }

  // ------------------------------------------------------------ one donation
  function donationPage(id) {
    api('/api/donations/' + id).then(function (data) { renderDonation(data.donation, data.bank); }).catch(function (err) {
      if (err && err.status === 401) { location.href = loginUrl(); return; }
      errorView(err, function () { donationPage(id); });
    });
  }

  function summary(d) {
    return el('div', { class: 'card rows' },
      row(t('d.amount'), lyd(d.amount_lyd)),
      row(t('d.campaign'), street(d)),
      row(t('d.code'), d.reference_code, { ltr: true }),
      row(t('d.status'), t('ds.' + d.status)),
      row(t('d.date'), date(d.reviewed_at || d.created_at)));
  }

  function renderDonation(d, bank) {
    if (d.status === 'awaiting_transfer') return transferStep(d, bank);
    if (d.status === 'under_review') {
      return show(
        el('div', { class: 'notice ok' }, el('strong', null, t('thanks.title')), el('br'), t('thanks.body')),
        summary(d),
        el('button', { class: 'btn secondary', type: 'button', onclick: function () { proofStep(d); } }, t('thanks.replace')),
        el('a', { class: 'btn text', href: '/pothole/' + d.pothole_id }, t('d.back')),
        el('a', { class: 'btn text', href: '/donations' }, t('nav.mine')));
    }
    if (d.status === 'confirmed') {
      return show(
        el('div', { class: 'card receipt' },
          el('h1', null, t('receipt.title')),
          el('p', { style: 'margin:0' }, t('receipt.thanks')),
          el('div', { class: 'rows' },
            row(t('d.amount'), lyd(d.amount_lyd)),
            row(t('d.campaign'), street(d)),
            row(t('d.code'), d.reference_code, { ltr: true }),
            row(t('d.date'), date(d.reviewed_at || d.created_at)))),
        el('button', { class: 'btn secondary', type: 'button', onclick: function () { window.print(); } }, t('receipt.print')),
        el('a', { class: 'btn text', href: '/pothole/' + d.pothole_id }, t('d.back')));
    }
    var wa = root.getAttribute('data-whatsapp');
    var body = d.status === 'rejected' ? t('rejected.body') : d.status === 'expired' ? t('expired.body') : t('cancelled.body');
    show(
      el('div', { class: 'notice' + (d.status === 'rejected' ? ' err' : '') }, body, d.reject_reason ? el('div', { style: 'margin-top:8px' }, t('rejected.reason', { r: d.reject_reason })) : null),
      summary(d),
      d.status === 'rejected' && wa ? el('a', { class: 'btn secondary', href: 'https://wa.me/' + wa.replace('+', ''), rel: 'noopener' }, t('contact')) : null,
      el('a', { class: 'btn primary', href: '/donate/' + d.campaign_id }, t('again')));
  }

  function transferStep(d, bank) {
    var rows = el('div', { class: 'card rows' },
      row(t('bank.holder'), bank.account_holder, { copy: bank.account_holder }),
      row(t('bank.name'), bank.bank_name),
      bank.account_number ? row(t('bank.account'), bank.account_number, { ltr: true, copy: bank.account_number }) : null,
      bank.iban ? row(t('bank.iban'), groupIban(bank.iban), { ltr: true, copy: bank.iban }) : null,
      row(t('bank.amount'), lyd(d.amount_lyd), { copy: String(d.amount_lyd) }));
    show(
      el('div', null, el('h1', null, t('step1.title')), el('div', { class: 'small secondary' }, t('step.of', { a: 1 }))),
      el('ol', { class: 'steps' }, el('li', null, t('step1.s1')), el('li', null, t('step1.s2')), el('li', null, t('step1.s3'))),
      rows,
      el('div', { class: 'card highlight rows' }, row(t('bank.code'), d.reference_code, { ltr: true, code: true, copy: d.reference_code })),
      d.expires_at ? el('p', { class: 'small secondary', style: 'margin:0' }, t('step1.until', { d: date(d.expires_at, true) })) : null,
      el('button', { class: 'btn primary', type: 'button', onclick: function () { proofStep(d); } }, t('step1.done')),
      el('a', { class: 'btn secondary', href: '/donations' }, t('step1.later')),
      el('button', {
        class: 'btn text', type: 'button', onclick: function () {
          if (!window.confirm(t('step1.cancelConfirm'))) return;
          api('/api/donations/' + d.id + '/cancel', { method: 'POST', body: {} }).then(function () { donationPage(d.id); }).catch(function (err) { errorView(err); });
        },
      }, t('step1.cancel')));
  }

  function proofStep(d) {
    var blob = null;
    var input = el('input', { id: 'sent', type: 'number', inputmode: 'decimal', min: LIMITS.min, max: LIMITS.max, step: '0.001' });
    input.value = String(d.amount_lyd);
    var chips = el('div', { class: 'chips', role: 'group', 'aria-label': t('amount.quick') });
    QUICK.forEach(function (v) {
      chips.appendChild(el('button', { class: 'chip', type: 'button', onclick: function () { input.value = String(v); } }, String(v)));
    });
    var file = el('input', { id: 'shot', type: 'file', accept: 'image/*', class: 'sr-only' });
    var preview = el('div', { class: 'preview', hidden: true });
    var status = el('div', { class: 'small secondary', 'aria-live': 'polite' });
    var drop = el('label', { class: 'drop', for: 'shot' }, t('step2.pick'));
    var error = el('div', { class: 'notice err', role: 'alert', hidden: true });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      error.hidden = true;
      compress(f).then(function (b) {
        blob = b;
        preview.textContent = '';
        preview.appendChild(el('img', { src: URL.createObjectURL(b), alt: t('step2.shot') }));
        preview.hidden = false;
        drop.textContent = t('step2.replace');
        status.textContent = t('step2.added', { kb: Math.round(b.size / 1024) });
      }).catch(function () {
        blob = null;
        error.hidden = false;
        error.textContent = t('step2.badImage');
      });
    });
    var submit = el('button', { class: 'btn primary', type: 'submit' }, t('step2.submit'));
    var form = el('form', { class: 'card', novalidate: true },
      el('div', null, el('h1', null, t('step2.title')), el('div', { class: 'small secondary' }, t('step.of', { a: 2 }))),
      el('div', { class: 'field' }, el('label', { for: 'sent' }, t('step2.amount')), el('div', { class: 'input-wrap' }, input, el('span', { class: 'secondary' }, t('lyd')))),
      chips,
      el('div', { class: 'field' }, el('span', null, el('strong', null, t('step2.shot'))), file, drop, preview, status, el('span', { class: 'caption secondary' }, t('step2.private'))),
      error,
      submit);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var value = Number(input.value);
      if (!(value >= LIMITS.min && value <= LIMITS.max)) {
        error.hidden = false;
        error.textContent = t('amount.invalid', { min: LIMITS.min, max: LIMITS.max });
        return;
      }
      if (!blob) { error.hidden = false; error.textContent = t('step2.needShot'); return; }
      var fd = new FormData();
      fd.append('proof', blob, 'transfer.jpg');
      fd.append('amount_lyd', String(value));
      submit.disabled = true;
      submit.textContent = t('step2.sending');
      api('/api/donations/' + d.id + '/proof', { method: 'POST', form: fd })
        .then(function (res) { renderDonation(res.donation, null); })
        .catch(function (err) {
          submit.disabled = false;
          submit.textContent = t('step2.submit');
          error.hidden = false;
          error.textContent = (err && (lang === 'ar' ? err.error_ar : err.error)) || t('err.generic');
        });
    });
    show(form, el('button', { class: 'btn text', type: 'button', onclick: function () { donationPage(d.id); } }, t('back')));
  }

  // ------------------------------------------------------------ my donations
  function minePage() {
    api('/api/donations/mine').then(function (data) {
      var list = data.results;
      var total = list.filter(function (d) { return d.status === 'confirmed'; }).reduce(function (s, d) { return s + d.amount_lyd; }, 0);
      var items = el('div', { class: 'list' });
      list.forEach(function (d) {
        var sub = d.status === 'awaiting_transfer' && d.expires_at
          ? t('mine.ends', { h: Math.max(0, Math.ceil((Date.parse(d.expires_at) - Date.now()) / 3600000)) }) + ' · ' + d.reference_code
          : date(d.reviewed_at || d.created_at);
        items.appendChild(el('a', { class: 'card item', href: '/donations/' + d.id },
          el('div', { class: 'donor' }, el('strong', null, street(d) + ' · ' + lyd(d.amount_lyd)), el('span', { class: 'badge ' + d.status }, t('ds.' + d.status))),
          el('div', { class: 'small secondary' }, sub),
          d.status === 'awaiting_transfer' ? el('span', { class: 'link' }, t('mine.continue')) : null,
          d.status === 'rejected' && d.reject_reason ? el('div', { class: 'small' }, t('rejected.reason', { r: d.reject_reason })) : null));
      });
      show(
        el('h1', null, t('mine.title')),
        el('div', { class: 'card' }, el('div', { class: 'small secondary' }, t('mine.total')), el('div', { class: 'money' }, lyd(total))),
        list.length ? items : el('div', { class: 'card' }, el('p', { class: 'muted', style: 'margin:0' }, t('mine.empty')), el('a', { class: 'btn secondary', href: '/map' }, t('mine.map'))));
    }).catch(function (err) {
      if (err && err.status === 401) {
        show(el('div', { class: 'card' }, el('p', { style: 'margin:0' }, t('mine.signin')), el('a', { class: 'btn primary', href: loginUrl() }, t('signin.button'))));
        return;
      }
      errorView(err, minePage);
    });
  }

  // ------------------------------------------------------------ start
  function route() {
    applyLang();
    var page = root.getAttribute('data-page');
    var id = Number(root.getAttribute('data-id'));
    if (page === 'campaign') campaignPage(id);
    else if (page === 'donation') donationPage(id);
    else minePage();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var toggle = document.getElementById('lang-toggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        lang = lang === 'ar' ? 'en' : 'ar';
        try { localStorage.setItem('hufra.donate.lang', lang); } catch (e) { /* ignore */ }
        route();
      });
    }
    route();
  });
})();
