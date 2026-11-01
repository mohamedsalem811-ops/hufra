// Pothole detail page: location map, street/landmark info, dimensions,
// citizen "Confirm Pothole (+1)" upvote button, 1-tap share button,
// 1-click Admin Delete button (shown automatically when an admin is logged in),
// interactive "Before vs. After Repair" comparison slider when fixed,
// localized photo gallery grouped by stage, status tracker, and history log.
(function () {
  'use strict';

  var STATUS_ORDER = ['reported', 'verified', 'under_repair', 'fixed'];

  function statusIndex(status) {
    return STATUS_ORDER.indexOf(status);
  }

  function renderStatusTracker(currentStatus) {
    var t = window.HufraI18n.t;
    var currentIndex = statusIndex(currentStatus);
    return '<div class="status-tracker">' + STATUS_ORDER.map(function (status, index) {
      var cls = index < currentIndex ? 'is-complete' : (index === currentIndex ? 'is-current' : '');
      return '<div class="stage ' + cls + '"><div class="dot"></div><div class="label">' + t('status_' + status) + '</div></div>';
    }).join('') + '</div>';
  }

  function groupPhotosByStage(photos) {
    var groups = { report: [], before: [], during: [], after: [] };
    photos.forEach(function (photo) {
      if (groups[photo.stage]) groups[photo.stage].push(photo);
    });
    return groups;
  }

  function renderBeforeAfterCard(photos) {
    var t = window.HufraI18n.t;
    var groups = groupPhotosByStage(photos);
    var beforePhoto = groups.before[0] || groups.report[0];
    var afterPhoto = groups.after[groups.after.length - 1];
    if (!beforePhoto || !afterPhoto) return '';

    var media = window.HufraMap.mediaUrl;
    return (
      '<div class="card mt-4">' +
        '<div class="flex justify-between items-center mb-3 wrap-gap">' +
          '<h2 class="card-title">' + t('before_after_title') + '</h2>' +
          '<span class="badge badge-fixed">' + t('status_fixed') + '</span>' +
        '</div>' +
        '<div id="ba-compare-box" class="ba-compare">' +
          '<img src="' + media(afterPhoto.r2_key) + '" alt="After">' +
          '<div id="ba-before-clip" class="ba-compare__before">' +
            '<img src="' + media(beforePhoto.r2_key) + '" alt="Before">' +
          '</div>' +
          '<span class="ba-pill ba-pill--before">' + t('stage_before') + '</span>' +
          '<span class="ba-pill ba-pill--after">' + t('stage_after') + '</span>' +
        '</div>' +
        '<input type="range" id="ba-slider" class="ba-slider" min="5" max="95" value="50" aria-label="Before and after comparison slider">' +
      '</div>'
    );
  }

  function photoGalleryHtml(photos) {
    var t = window.HufraI18n.t;
    var groups = groupPhotosByStage(photos);
    var stageKeys = {
      report: 'stage_report',
      before: 'stage_before',
      during: 'stage_during',
      after: 'stage_after',
    };
    var html = '';
    ['report', 'before', 'during', 'after'].forEach(function (stage) {
      if (groups[stage].length === 0) return;
      html += '<h3 class="mt-4 mb-2">' + t(stageKeys[stage]) + '</h3>';
      html += '<div class="grid grid-3">';
      groups[stage].forEach(function (photo) {
        html += '<a href="' + window.HufraMap.mediaUrl(photo.r2_key) + '" target="_blank" rel="noopener" class="gallery-thumb">' +
          '<img src="' + window.HufraMap.mediaUrl(photo.thumb_key) + '" loading="lazy" alt="">' +
          '</a>';
      });
      html += '</div>';
    });
    return html;
  }

  function historyHtml(history) {
    var t = window.HufraI18n.t;
    if (!history.length) return '<p class="text-secondary">' + t('empty_no_results') + '</p>';
    return '<ul class="history-list">' + history.map(function (item) {
      var date = new Date(item.at).toLocaleString(window.HufraI18n.getLocale() === 'ar' ? 'ar-LY' : 'en-GB');
      return '<li class="flex gap-3 items-center mb-2 wrap-gap">' +
        '<span class="badge badge-' + item.to_status + '">' + t('status_' + item.to_status) + '</span>' +
        '<span class="text-secondary small">' + date + '</span>' +
        (item.note ? '<span class="small">' + escapeHtml(item.note) + '</span>' : '') +
        '</li>';
    }).join('') + '</ul>';
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  async function load() {
    var root = document.getElementById('pothole-detail-root');
    // The bundled app uses pothole.html?id=N; the website renders the id into
    // data-pothole-id (an attribute, not an inline script, so CSP can forbid those).
    var id = new URLSearchParams(location.search).get('id') || (root && root.getAttribute('data-pothole-id'));
    try {
      var data = await window.HufraApi.get('/potholes/' + id);
      var t = window.HufraI18n.t;
      var locale = window.HufraI18n.getLocale();
      var pothole = data.pothole;
      var regionName = locale === 'ar' ? pothole.region_name_ar : pothole.region_name_en;
      var street = locale === 'ar' ? (pothole.street_ar || pothole.street_en) : (pothole.street_en || pothole.street_ar);
      var description = locale === 'ar' ? pothole.description_ar : (pothole.description_en || pothole.description_ar);
      var upvotes = pothole.upvotes_count || 0;
      var mapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + pothole.lat + ',' + pothole.lng;

      var dims = [];
      if (pothole.length_cm) dims.push(t('report_length') + ': ' + pothole.length_cm);
      if (pothole.width_cm) dims.push(t('report_width') + ': ' + pothole.width_cm);
      if (pothole.depth_cm) dims.push(t('report_depth') + ': ' + pothole.depth_cm);

      root.innerHTML =
        '<div id="pothole-map" class="detail-map"></div>' +
        '<div class="flex justify-between items-center mt-4 wrap-gap">' +
          '<div>' +
            '<h2 class="detail-title">#' + pothole.id + ' · ' + escapeHtml(regionName || '') + '</h2>' +
            (street ? '<div class="text-secondary mt-1 strong">' + escapeHtml(street) + '</div>' : '') +
          '</div>' +
          '<span class="badge badge-' + pothole.status + '">' + t('status_' + pothole.status) + '</span>' +
        '</div>' +
        '<div class="flex gap-3 mt-3 items-center wrap-gap">' +
          '<span class="flex gap-2 items-center"><span class="severity-dot severity-' + pothole.severity + '"></span><strong>' + t('severity_' + pothole.severity) + '</strong></span>' +
          (dims.length ? '<span class="text-secondary small">(' + escapeHtml(dims.join(' · ')) + ')</span>' : '') +
        '</div>' +
        (description ? '<p class="mt-3">' + escapeHtml(description) + '</p>' : '') +
        '<div class="flex gap-2 mt-4 wrap-gap">' +
          '<button type="button" class="btn btn-primary" id="upvote-pothole-btn">' +
            '<i data-lucide="thumbs-up" class="icon"></i> ' +
            '<span id="upvote-btn-label">' + t('pothole_upvote_btn') + ' (' + upvotes + ')</span>' +
          '</button>' +
          '<a href="' + mapsUrl + '" target="_blank" rel="noopener" class="btn btn-secondary">' +
            '<i data-lucide="navigation" class="icon"></i> ' +
            '<span>' + t('admin_navigate_maps') + '</span>' +
          '</a>' +
          '<button type="button" class="btn btn-outline" id="share-pothole-btn">' +
            '<i data-lucide="share-2" class="icon"></i> ' +
            '<span>' + t('pothole_share_btn') + '</span>' +
          '</button>' +
          '<button type="button" class="btn btn-danger hidden" id="admin-detail-delete-btn">' +
            '<i data-lucide="trash-2" class="icon"></i> ' +
            '<span>' + t('admin_delete_report') + '</span>' +
          '</button>' +
        '</div>' +
        '<div class="card mt-4">' + renderStatusTracker(pothole.status) + '</div>' +
        renderBeforeAfterCard(data.photos) +
        '<div class="mt-5">' + photoGalleryHtml(data.photos) + '</div>' +
        '<h2 class="mt-5" data-i18n="timeline_title">' + t('timeline_title') + '</h2>' +
        '<div class="card">' + historyHtml(data.history) + '</div>';

      var map = window.HufraMap.createMap('pothole-map', { zoomControl: true });
      window.addEventListener('hufra:page-leave', function () { try { map.remove(); } catch (e) { /* gone */ } }, { once: true });
      map.setView([pothole.lat, pothole.lng], 16);
      L.marker([pothole.lat, pothole.lng], { icon: window.HufraMap.pinIcon(pothole.status, { large: true }) }).addTo(map);

      var baSlider = document.getElementById('ba-slider');
      var baClip = document.getElementById('ba-before-clip');
      if (baSlider && baClip) {
        baSlider.addEventListener('input', function () {
          baClip.style.width = baSlider.value + '%';
        });
      }

      var upvoteBtn = document.getElementById('upvote-pothole-btn');
      if (upvoteBtn) {
        upvoteBtn.addEventListener('click', async function () {
          upvoteBtn.disabled = true;
          try {
            var res = await window.HufraApi.post('/potholes/' + id + '/upvote', {});
            window.HufraUI.haptic('success');
            document.getElementById('upvote-btn-label').textContent =
              t('pothole_upvote_btn') + ' (' + res.upvotes_count + ')';
            window.HufraUI.showToast(
              res.already_upvoted ? t('pothole_already_upvoted') : t('pothole_upvoted_toast'),
              res.already_upvoted ? 'info' : 'success'
            );
          } catch (err) {
            window.HufraUI.showToast(err.message || t('error_generic'), 'error');
            upvoteBtn.disabled = false;
          }
        });
      }

      var shareBtn = document.getElementById('share-pothole-btn');
      if (shareBtn) {
        shareBtn.addEventListener('click', async function () {
          var shareUrl = location.href;
          var shareTitle = 'HUFRA #' + pothole.id + ' - ' + (regionName || '');
          if (navigator.share) {
            await navigator.share({ title: shareTitle, url: shareUrl }).catch(function () {});
          } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(shareUrl);
            window.HufraUI.showToast(t('pothole_link_copied'), 'success');
          }
        });
      }

      // Show 1-click delete button if current user is admin or super_admin
      window.HufraApi.get('/auth/me').then(function (me) {
        if (me && me.user && (me.user.role === 'admin' || me.user.role === 'super_admin')) {
          var delBtn = document.getElementById('admin-detail-delete-btn');
          if (delBtn) {
            delBtn.classList.remove('hidden');
            delBtn.addEventListener('click', async function () {
              delBtn.disabled = true;
              try {
                await window.HufraApi.del('/potholes/' + id);
                window.HufraUI.showToast(t('admin_report_deleted'), 'success');
                setTimeout(function () { window.HufraRouter ? window.HufraRouter.go('/admin') : (location.href = '/admin'); }, 400);
              } catch (err) {
                window.HufraUI.showToast(err.message || t('error_generic'), 'error');
                delBtn.disabled = false;
              }
            });
          }
        }
      }).catch(function () {});

      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      root.innerHTML = '<div class="empty-state"><i data-lucide="alert-triangle" class="icon-xl"></i><p>' + window.HufraI18n.t('error_generic') + '</p></div>';
      if (window.lucide) window.lucide.createIcons();
    }
  }

  document.addEventListener('DOMContentLoaded', load);
})();
