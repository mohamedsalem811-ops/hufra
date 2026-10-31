// Admin dashboard & Mobile Field Admin behavior (with 1-Click Report Delete
// on both the queue cards and the review modal, plus CSV Work-Order export).
(function () {
  'use strict';

  // Admin page does not load the map scripts, so build media URLs from the API helper.
  function mediaUrl(key) {
    return window.HufraApi.mediaBase() + '/media/' + key;
  }

  var currentUser = null;
  var currentStatusFilter = '';
  var fieldGpsCoords = null;
  var lastLoadedRows = [];
  var notifTimer = null;

  function t(key) { return window.HufraI18n.t(key); }

  function haversineMeters(a, b) {
    var R = 6371000;
    var toRad = function (deg) { return (deg * Math.PI) / 180; };
    var dLat = toRad(b.lat - a.lat);
    var dLng = toRad(b.lng - a.lng);
    var s1 = Math.sin(dLat / 2);
    var s2 = Math.sin(dLng / 2);
    var h = s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function formatDistance(meters) {
    if (!Number.isFinite(meters)) return '';
    if (meters < 1000) return Math.round(meters) + ' m';
    return (meters / 1000).toFixed(1) + ' km';
  }

  async function guardAdmin() {
    try {
      var data = await window.HufraApi.get('/auth/me');
      if (data.user.role !== 'admin' && data.user.role !== 'super_admin') {
        window.HufraRouter ? window.HufraRouter.go('/') : (location.href = '/');
        return null;
      }
      currentUser = data.user;
      if (currentUser.role === 'super_admin') {
        document.getElementById('audit-tab-btn').classList.remove('hidden');
        var adminsTabBtn = document.getElementById('admins-tab-btn');
        if (adminsTabBtn) adminsTabBtn.classList.remove('hidden');
      }
      return currentUser;
    } catch (e) {
      window.HufraRouter ? window.HufraRouter.go('/login?redirect=/admin') : (location.href = '/login?redirect=/admin');
      return null;
    }
  }

  function initTabs() {
    document.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('[data-tab]').forEach(function (b) { b.classList.remove('is-selected'); b.setAttribute('aria-selected','false'); });
        btn.classList.add('is-selected'); btn.setAttribute('aria-selected','true');
        var tab = btn.getAttribute('data-tab');
        document.querySelectorAll('.admin-tab').forEach(function (panel) {
          panel.classList.toggle('hidden', panel.id !== 'admin-tab-' + tab);
        });
        if (tab === 'duplicates') loadDuplicates();
        if (tab === 'analytics') loadAnalytics();
        if (tab === 'regions') loadRegions();
        if (tab === 'donors') loadDonors();
        if (tab === 'admins') loadAdmins();
        if (tab === 'audit') loadAuditLog();
      });
    });
    document.querySelector('[data-tab="reports"]').classList.add('is-selected');
  }

  function exportWorkOrdersCsv() {
    if (!lastLoadedRows.length) {
      window.HufraUI.showToast(t('empty_no_results'), 'info');
      return;
    }
    var headers = ['ID', 'Region_AR', 'Region_EN', 'Street', 'Severity', 'Status', 'Upvotes', 'Lat', 'Lng', 'Google_Maps_URL', 'Created_At'];
    var csvRows = [headers.join(',')];
    lastLoadedRows.forEach(function (r) {
      var mapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + r.lat + ',' + r.lng;
      var cols = [
        r.id,
        csvCell(r.region_name_ar),
        csvCell(r.region_name_en),
        csvCell(r.street_ar || r.street_en || ''),
        r.severity,
        r.status,
        r.upvotes_count || 0,
        r.lat,
        r.lng,
        csvCell(mapsUrl),
        r.created_at,
      ];
      csvRows.push(cols.join(','));
    });
    var blob = new Blob(['\uFEFF' + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'hufra-work-orders-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function csvCell(val) {
    var s = String(val == null ? '' : val).replace(/"/g, '""');
    return '"' + s + '"';
  }

  // --- One-Click Report Delete (works from card or modal, online & offline) -
  async function deleteReportOneClick(id) {
    var ok = await window.HufraUI.confirm(t('admin_delete_confirm_report'));
    if (!ok) {
      var pendingBtns = document.querySelectorAll('[data-one-click-delete="' + id + '"], #modal-delete-report-btn');
      pendingBtns.forEach(function (b) { b.disabled = false; });
      return;
    }
    try {
      if (navigator.onLine === false && window.HufraOfflineQueue) {
        await window.HufraOfflineQueue.enqueueAdminAction({
          type: 'delete_report',
          potholeId: Number(id),
        });
        window.HufraUI.showToast(t('offline_admin_queued'), 'info');
        closeModal();
        var cardOffline = document.querySelector('[data-report-id="' + id + '"]');
        if (cardOffline) cardOffline.remove();
        return;
      }
      await window.HufraApi.del('/potholes/' + id);
      window.HufraUI.showToast(t('admin_report_deleted'), 'success');
      closeModal();
      var cardEl = document.querySelector('[data-report-id="' + id + '"]');
      if (cardEl) cardEl.remove();
      loadReports();
    } catch (e) {
      if (window.HufraOfflineQueue && window.HufraOfflineQueue.isNetworkError(e)) {
        await window.HufraOfflineQueue.enqueueAdminAction({
          type: 'delete_report',
          potholeId: Number(id),
        });
        window.HufraUI.showToast(t('offline_admin_queued'), 'info');
        closeModal();
        return;
      }
      window.HufraUI.showToast(e.message || t('error_generic'), 'error');
    }
  }

  function initStatusFilter() {
    document.querySelectorAll('#reports-status-filter .chip-option[data-status]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        document.querySelectorAll('#reports-status-filter .chip-option[data-status]').forEach(function (c) { c.classList.remove('is-selected'); });
        chip.classList.add('is-selected');
        currentStatusFilter = chip.getAttribute('data-status');
        loadReports();
      });
    });

    var gpsBtn = document.getElementById('admin-field-near-btn');
    if (gpsBtn) {
      gpsBtn.addEventListener('click', async function () {
        if (fieldGpsCoords) {
          fieldGpsCoords = null;
          gpsBtn.classList.remove('is-selected');
          loadReports();
          return;
        }
        gpsBtn.disabled = true;
        try {
          var pos = window.HufraBridge
            ? await window.HufraBridge.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 })
            : await new Promise(function (resolve, reject) {
                navigator.geolocation.getCurrentPosition(
                  function (p) { resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); },
                  reject,
                  { enableHighAccuracy: true, timeout: 10000 }
                );
              });
          fieldGpsCoords = { lat: pos.lat, lng: pos.lng };
          gpsBtn.classList.add('is-selected');
          loadReports();
        } catch (err) {
          window.HufraUI.showToast(t('report_location_error'), 'error');
        } finally {
          gpsBtn.disabled = false;
        }
      });
    }

    var exportBtn = document.getElementById('admin-export-csv-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportWorkOrdersCsv);
    }
  }

  async function loadReports() {
    var container = document.getElementById('reports-list');
    try {
      var query = currentStatusFilter ? '?status=' + currentStatusFilter : '';
      var data = await window.HufraApi.get('/admin/reports' + query);
      var rows = (data.results || []).slice();

      if (fieldGpsCoords) {
        rows.forEach(function (r) {
          r._distance_m = haversineMeters(fieldGpsCoords, { lat: r.lat, lng: r.lng });
        });
        rows.sort(function (a, b) { return a._distance_m - b._distance_m; });
      }
      lastLoadedRows = rows;

      if (!rows.length) {
        container.innerHTML = '<div class="empty-state"><i data-lucide="inbox" class="icon-xl"></i><p>' + t('empty_no_results') + '</p></div>';
        if (window.lucide) window.lucide.createIcons();
        return;
      }
      var locale = window.HufraI18n.getLocale();
      container.innerHTML = rows.map(function (r) {
        var regionName = locale === 'ar' ? r.region_name_ar : r.region_name_en;
        var street = locale === 'ar' ? (r.street_ar || r.street_en) : (r.street_en || r.street_ar);
        var date = new Date(r.created_at).toLocaleString(locale === 'ar' ? 'ar-LY' : 'en-GB');
        var dupBadge = r.duplicate_flag_count > 0 ? '<span class="badge badge-warn">' + t('admin_duplicates') + '</span>' : '';
        var upvoteBadge = r.upvotes_count > 0 ? '<span class="badge badge-neutral">👍 ' + r.upvotes_count + '</span>' : '';
        var distBadge = r._distance_m !== undefined
          ? '<span class="badge badge-neutral">📍 ' + formatDistance(r._distance_m) + '</span>'
          : '';
        return '<div class="card card-hover mb-3 is-clickable" data-report-id="' + r.id + '">' +
          '<div class="flex justify-between items-center wrap-gap">' +
            '<div>' +
              '<strong>#' + r.id + ' · ' + escapeHtml(regionName || '') + '</strong>' +
              ' <span class="severity-dot severity-' + r.severity + ' dot-gap"></span>' +
              (street ? '<div class="text-secondary small">' + escapeHtml(street) + '</div>' : '') +
            '</div>' +
            '<div class="flex gap-2 items-center wrap-gap">' +
              distBadge + upvoteBadge + dupBadge +
              '<span class="badge badge-' + r.status + '">' + t('status_' + r.status) + '</span>' +
              '<button type="button" class="btn btn-danger btn-sm" data-one-click-delete="' + r.id + '" title="' + t('admin_delete_report') + '">' +
                '<i data-lucide="trash-2" class="icon icon-sm"></i> ' +
                '<span>' + t('admin_delete_report') + '</span>' +
              '</button>' +
            '</div>' +
          '</div>' +
          '<div class="text-secondary mt-1 small">' + date + '</div>' +
        '</div>';
      }).join('');

      container.querySelectorAll('[data-one-click-delete]').forEach(function (delBtn) {
        delBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          delBtn.disabled = true;
          deleteReportOneClick(delBtn.getAttribute('data-one-click-delete'));
        });
      });

      container.querySelectorAll('[data-report-id]').forEach(function (card) {
        card.addEventListener('click', function () { openReportModal(card.getAttribute('data-report-id')); });
      });

      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      window.HufraUI.showToast(t('error_generic'), 'error');
    }
  }

  async function openReportModal(id) {
    var modal = document.getElementById('report-modal');
    var content = document.getElementById('report-modal-content');
    modal.classList.remove('hidden');
    content.innerHTML = '<div class="skeleton skeleton-h200"></div>';

    try {
      var data = await window.HufraApi.get('/potholes/' + id);
      var locale = window.HufraI18n.getLocale();
      var pothole = data.pothole;
      var regionName = locale === 'ar' ? pothole.region_name_ar : pothole.region_name_en;
      var street = locale === 'ar' ? (pothole.street_ar || pothole.street_en) : (pothole.street_en || pothole.street_ar);
      var mapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + pothole.lat + ',' + pothole.lng;

      content.innerHTML =
        '<div class="flex justify-between items-center mb-3 wrap-gap">' +
          '<h2 class="detail-title">#' + pothole.id + ' · ' + escapeHtml(regionName || '') + '</h2>' +
          '<div class="flex gap-2 items-center">' +
            '<button type="button" class="btn btn-danger btn-sm" id="modal-delete-report-btn">' +
              '<i data-lucide="trash-2" class="icon icon-sm"></i> ' +
              '<span>' + t('admin_delete_report') + '</span>' +
            '</button>' +
            '<button type="button" class="btn btn-icon btn-secondary" id="close-modal-btn"><i data-lucide="x" class="icon"></i></button>' +
          '</div>' +
        '</div>' +
        (street ? '<p><strong>' + t('report_street_ar') + ':</strong> ' + escapeHtml(street) + '</p>' : '') +
        '<p><strong>' + t('map_filter_status') + ':</strong> <span class="badge badge-' + pothole.status + '">' + t('status_' + pothole.status) + '</span></p>' +
        '<p><strong>' + t('report_severity_label') + ':</strong> ' + t('severity_' + pothole.severity) +
          (pothole.upvotes_count ? ' · 👍 ' + pothole.upvotes_count : '') + '</p>' +
        '<div class="flex gap-2 items-center mb-3 wrap-gap">' +
          '<span><strong>' + t('report_step_location') + ':</strong> ' + pothole.lat.toFixed(5) + ', ' + pothole.lng.toFixed(5) + '</span>' +
          '<a href="/map?focus=' + pothole.id + '" class="btn btn-secondary btn-sm">' + t('nav_map') + '</a>' +
          '<a href="' + mapsUrl + '" target="_blank" rel="noopener" class="btn btn-outline btn-sm">' + t('admin_navigate_maps') + '</a>' +
        '</div>' +
        (pothole.description_ar ? '<p><strong>' + t('report_description_ar') + ':</strong> ' + escapeHtml(pothole.description_ar) + '</p>' : '') +
        (pothole.reporter_contact ? '<p><strong>' + t('report_contact_label') + ':</strong> ' + escapeHtml(pothole.reporter_contact) + '</p>' : '') +
        '<div class="grid grid-3 mt-3" id="modal-photos">' +
          data.photos.map(function (p) {
            return '<div class="gallery-item" data-photo-id="' + p.id + '">' +
              '<a href="' + mediaUrl(p.r2_key) + '" target="_blank" rel="noopener" class="gallery-thumb"><img src="' + mediaUrl(p.thumb_key) + '" alt="" loading="lazy"></a>' +
              '<span class="gallery-stage">' + t('stage_' + p.stage) + '</span>' +
              '<button type="button" class="btn btn-danger btn-icon btn-sm gallery-del" data-photo-delete="' + p.id + '" aria-label="' + t('admin_delete_photo') + '" title="' + t('admin_delete_photo') + '"><i data-lucide="trash-2" class="icon icon-sm"></i></button>' +
            '</div>';
          }).join('') +
        '</div>' +
        '<div class="flex gap-2 mt-4 wrap-gap">' +
          statusActionButton(pothole.status, 'verified', 'admin_verify') +
          statusActionButton(pothole.status, 'under_repair', 'admin_mark_under_repair') +
          statusActionButton(pothole.status, 'fixed', 'admin_mark_fixed') +
        '</div>' +
        '<div class="field mt-3">' +
          '<label for="admin-note">' + t('admin_add_note') + '</label>' +
          '<textarea class="textarea" id="admin-note" rows="2"></textarea>' +
        '</div>' +
        '<div class="field">' +
          '<label>' + t('admin_upload_proof') + '</label>' +
          '<div class="flex gap-2 wrap-gap">' +
            proofUploadButton('before') + proofUploadButton('during') + proofUploadButton('after') +
          '</div>' +
        '</div>';

      document.getElementById('close-modal-btn').addEventListener('click', closeModal);
      var modalDelBtn = document.getElementById('modal-delete-report-btn');
      if (modalDelBtn) {
        modalDelBtn.addEventListener('click', function () {
          modalDelBtn.disabled = true;
          deleteReportOneClick(id);
        });
      }
      content.querySelectorAll('[data-photo-delete]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var ok = await window.HufraUI.confirm(t('admin_delete_photo_confirm'));
          if (!ok) return;
          btn.disabled = true;
          try {
            await window.HufraApi.del('/photos/' + btn.getAttribute('data-photo-delete'));
            window.HufraUI.showToast(t('admin_photo_deleted'), 'success');
            var item = btn.closest('.gallery-item');
            if (item) item.remove();
          } catch (err) {
            btn.disabled = false;
            window.HufraUI.showToast(err.message || t('error_generic'), 'error');
          }
        });
      });
      content.querySelectorAll('[data-status-action]').forEach(function (btn) {
        btn.addEventListener('click', function () { submitStatusChange(id, btn.getAttribute('data-status-action')); });
      });
      content.querySelectorAll('[data-proof-stage]').forEach(function (input) {
        input.addEventListener('change', function (e) { handleProofUpload(id, input.getAttribute('data-proof-stage'), e); });
      });
      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      if (window.console) console.error('[admin] report modal failed', e);
      content.innerHTML = '<p>' + t('error_generic') + '</p>';
    }
  }

  function statusActionButton(currentStatus, targetStatus, labelKey) {
    var disabled = currentStatus === targetStatus ? 'disabled' : '';
    return '<button type="button" class="btn btn-secondary" data-status-action="' + targetStatus + '" ' + disabled + '>' + t(labelKey) + '</button>';
  }

  function proofUploadButton(stage) {
    return '<label class="btn btn-outline is-clickable">' +
      t('stage_' + stage) +
      '<input type="file" accept="image/*" capture="environment" class="visually-hidden" data-proof-stage="' + stage + '">' +
      '</label>';
  }

  async function submitStatusChange(id, status) {
    var note = document.getElementById('admin-note').value;
    try {
      if (navigator.onLine === false && window.HufraOfflineQueue) {
        await window.HufraOfflineQueue.enqueueAdminAction({
          type: 'status_change',
          potholeId: Number(id),
          status: status,
          note: note || undefined,
        });
        window.HufraUI.showToast(t('offline_admin_queued'), 'info');
        closeModal();
        return;
      }
      await window.HufraApi.patch('/potholes/' + id + '/status', { status: status, note: note || undefined });
      window.HufraUI.showToast(t('save'), 'success');
      closeModal();
      loadReports();
    } catch (e) {
      if (window.HufraOfflineQueue && window.HufraOfflineQueue.isNetworkError(e)) {
        await window.HufraOfflineQueue.enqueueAdminAction({
          type: 'status_change',
          potholeId: Number(id),
          status: status,
          note: note || undefined,
        });
        window.HufraUI.showToast(t('offline_admin_queued'), 'info');
        closeModal();
        return;
      }
      window.HufraUI.showToast(e.message || t('error_generic'), 'error');
    }
  }

  async function handleProofUpload(id, stage, e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var compressed;
    try {
      compressed = await window.HufraImageCompress.compressImage(file);
      if (navigator.onLine === false && window.HufraOfflineQueue) {
        await window.HufraOfflineQueue.enqueueAdminAction({
          type: 'proof_photo',
          potholeId: Number(id),
          stage: stage,
          full: compressed.full,
          thumb: compressed.thumb,
          width: compressed.width,
          height: compressed.height,
        });
        window.HufraUI.showToast(t('offline_admin_queued'), 'info');
        return;
      }
      var ext = compressed.full && compressed.full.type === 'image/jpeg' ? 'jpg' : 'webp';
      var formData = new FormData();
      formData.append('full', compressed.full, 'photo.' + ext);
      formData.append('thumb', compressed.thumb, 'thumb.' + ext);
      formData.append('stage', stage);
      formData.append('width_px', String(compressed.width));
      formData.append('height_px', String(compressed.height));
      await window.HufraApi.postForm('/photos/' + id, formData);
      window.HufraUI.showToast(t('save'), 'success');
      openReportModal(id);
    } catch (err) {
      if (compressed && window.HufraOfflineQueue && window.HufraOfflineQueue.isNetworkError(err)) {
        await window.HufraOfflineQueue.enqueueAdminAction({
          type: 'proof_photo',
          potholeId: Number(id),
          stage: stage,
          full: compressed.full,
          thumb: compressed.thumb,
          width: compressed.width,
          height: compressed.height,
        });
        window.HufraUI.showToast(t('offline_admin_queued'), 'info');
        return;
      }
      window.HufraUI.showToast(err.message || t('error_generic'), 'error');
    }
  }

  function closeModal() {
    document.getElementById('report-modal').classList.add('hidden');
  }

  async function loadDuplicates() {
    var container = document.getElementById('duplicates-list');
    try {
      var data = await window.HufraApi.get('/admin/duplicates');
      if (!data.results.length) {
        container.innerHTML = '<div class="empty-state"><i data-lucide="check-circle" class="icon-xl"></i><p>' + t('empty_no_results') + '</p></div>';
        if (window.lucide) window.lucide.createIcons();
        return;
      }
      container.innerHTML = data.results.map(function (d) {
        return '<div class="card mb-3">' +
          '<p><a href="/pothole/' + d.pothole_id + '" target="_blank">#' + d.pothole_id + '</a> ↔ <a href="/pothole/' + d.duplicate_of_id + '" target="_blank">#' + d.duplicate_of_id + '</a> (' + Math.round(d.distance_m) + ' m)</p>' +
          '<div class="flex gap-2 wrap-gap">' +
            '<button type="button" class="btn btn-danger" data-dup-action="confirmed" data-dup-id="' + d.id + '">' + t('admin_confirm_dup') + '</button>' +
            '<button type="button" class="btn btn-secondary" data-dup-action="rejected" data-dup-id="' + d.id + '">' + t('admin_reject_dup') + '</button>' +
          '</div>' +
        '</div>';
      }).join('');
      container.querySelectorAll('[data-dup-action]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          try {
            await window.HufraApi.patch('/admin/duplicates/' + btn.getAttribute('data-dup-id'), { decision: btn.getAttribute('data-dup-action') });
            loadDuplicates();
          } catch (e) {
            window.HufraUI.showToast(t('error_generic'), 'error');
          }
        });
      });
    } catch (e) {
      window.HufraUI.showToast(t('error_generic'), 'error');
    }
  }

  async function loadAnalytics() {
    var container = document.getElementById('analytics-content');
    var locale = window.HufraI18n.getLocale();
    try {
      var data = await window.HufraApi.get('/admin/analytics');
      container.innerHTML =
        analyticsCard(t('admin_by_status'), data.by_status, 'status') +
        analyticsCard(t('admin_by_severity'), data.by_severity, 'severity') +
        analyticsCard(t('admin_by_region'), data.by_region.map(function (r) { return { label: locale === 'ar' ? r.name_ar : r.name_en, n: r.n }; })) +
        analyticsCard(t('admin_by_month'), data.by_month.map(function (m) { return { label: m.month, n: m.n }; }));
    } catch (e) {
      window.HufraUI.showToast(t('error_generic'), 'error');
    }
  }

  function analyticsCard(title, rows, translatePrefix) {
    rows = rows || [];
    var maxN = Math.max.apply(null, rows.map(function (r) { return r.n || 0; }).concat([1]));
    return '<div class="card">' +
      '<h3>' + escapeHtml(title) + '</h3>' +
      rows.map(function (r) {
        var label = translatePrefix ? t(translatePrefix + '_' + (r.status || r.severity)) : (r.label || '');
        var pct = Math.round(((r.n || 0) / maxN) * 100);
        return '<div class="mt-2">' +
          '<div class="flex justify-between small"><span>' + escapeHtml(label) + '</span><span>' + (r.n || 0) + '</span></div>' +
          '<progress class="bar" max="100" value="' + pct + '"></progress>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  async function loadRegions() {
    var container = document.getElementById('regions-table');
    try {
      var data = await window.HufraApi.get('/regions?all=1');
      container.innerHTML = '<table><thead><tr><th>Slug</th><th>العربية</th><th>English</th><th>Active</th><th></th></tr></thead><tbody>' +
        data.results.map(function (r) {
          return '<tr>' +
            '<td>' + escapeHtml(r.slug) + '</td>' +
            '<td>' + escapeHtml(r.name_ar) + '</td>' +
            '<td>' + escapeHtml(r.name_en) + '</td>' +
            '<td><span class="badge ' + (r.active ? 'badge-fixed' : 'badge-reported') + '">' + (r.active ? 'Active' : 'Inactive') + '</span></td>' +
            '<td class="row-actions">' +
              '<button type="button" class="btn btn-secondary btn-sm" data-region-toggle="' + r.id + '" data-region-active="' + (r.active ? '1' : '0') + '">' + t('admin_toggle_region') + '</button>' +
              '<button type="button" class="btn btn-danger btn-icon btn-sm" data-region-delete="' + r.id + '" aria-label="' + t('admin_delete_region') + '" title="' + t('admin_delete_region') + '"><i data-lucide="trash-2" class="icon icon-sm"></i></button>' +
            '</td>' +
          '</tr>';
        }).join('') + '</tbody></table>';

      container.querySelectorAll('[data-region-toggle]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var id = btn.getAttribute('data-region-toggle');
          var currentlyActive = btn.getAttribute('data-region-active') === '1';
          try {
            await window.HufraApi.patch('/regions/' + id, { active: !currentlyActive });
            loadRegions();
          } catch (err) {
            window.HufraUI.showToast(err.message || t('error_generic'), 'error');
          }
        });
      });
      container.querySelectorAll('[data-region-delete]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var ok = await window.HufraUI.confirm(t('admin_delete_region_confirm'));
          if (!ok) return;
          try {
            await window.HufraApi.del('/regions/' + btn.getAttribute('data-region-delete'));
            window.HufraUI.showToast(t('admin_region_deleted'), 'success');
            loadRegions();
          } catch (err) {
            window.HufraUI.showToast(err.message || t('error_generic'), 'error');
          }
        });
      });
      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      window.HufraUI.showToast(t('error_generic'), 'error');
    }
  }

  function initRegionForm() {
    var form = document.getElementById('region-form');
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      try {
        await window.HufraApi.post('/regions', {
          slug: document.getElementById('region-slug').value,
          name_ar: document.getElementById('region-name-ar').value,
          name_en: document.getElementById('region-name-en').value,
          center_lat: Number(document.getElementById('region-lat').value),
          center_lng: Number(document.getElementById('region-lng').value),
          active: true,
        });
        window.HufraUI.showToast(t('save'), 'success');
        form.reset();
        loadRegions();
      } catch (err) {
        window.HufraUI.showToast(err.message || t('error_generic'), 'error');
      }
    });
  }

  async function loadDonors() {
    var container = document.getElementById('donors-table');
    try {
      var data = await window.HufraApi.get('/donors');
      if (!data.results.length) {
        container.innerHTML = '<div class="empty-state"><i data-lucide="heart-handshake" class="icon-xl"></i><p>' + t('empty_no_results') + '</p></div>';
        if (window.lucide) window.lucide.createIcons();
        return;
      }
      container.innerHTML = '<table><thead><tr><th>Name</th><th>Amount (LYD)</th><th>Note</th><th></th></tr></thead><tbody>' +
        data.results.map(function (d) {
          return '<tr><td>' + escapeHtml(d.name) + '</td><td>' + Number(d.amount_lyd).toLocaleString() + '</td><td>' + escapeHtml(d.note || '') + '</td>' +
            '<td><button type="button" class="btn btn-icon btn-danger btn-sm" data-donor-delete="' + d.id + '" aria-label="' + t('delete') + '"><i data-lucide="trash-2" class="icon icon-sm"></i></button></td></tr>';
        }).join('') + '</tbody></table>';
      container.querySelectorAll('[data-donor-delete]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var ok = await window.HufraUI.confirm(t('admin_delete_donor_confirm'));
          if (!ok) return;
          try {
            await window.HufraApi.del('/donors/' + btn.getAttribute('data-donor-delete'));
            window.HufraUI.showToast(t('admin_donor_deleted'), 'success');
            loadDonors();
          } catch (e) {
            window.HufraUI.showToast(e.message || t('error_generic'), 'error');
          }
        });
      });
      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      window.HufraUI.showToast(t('error_generic'), 'error');
    }
  }

  function initDonorForm() {
    var form = document.getElementById('donor-form');
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      try {
        await window.HufraApi.post('/donors', {
          name: document.getElementById('donor-name').value,
          amount_lyd: Number(document.getElementById('donor-amount').value),
          note: document.getElementById('donor-note').value || undefined,
        });
        window.HufraUI.showToast(t('save'), 'success');
        form.reset();
        loadDonors();
      } catch (err) {
        window.HufraUI.showToast(err.message || t('error_generic'), 'error');
      }
    });
  }

  async function loadAdmins() {
    var container = document.getElementById('admins-table');
    if (!container) return;
    try {
      var data = await window.HufraApi.get('/admin/admins');
      container.innerHTML = '<table><thead><tr><th>Email</th><th>Code</th><th>Role</th><th>Created</th><th></th></tr></thead><tbody>' +
        (data.results || []).map(function (a) {
          var isMe = currentUser && a.id === currentUser.id;
          var action = isMe
            ? '<span class="badge badge-neutral">' + t('admin_this_is_you') + '</span>'
            : '<button type="button" class="btn btn-danger btn-sm" data-admin-remove="' + escapeHtml(a.email) + '"><i data-lucide="user-minus" class="icon icon-sm"></i> ' + t('admin_remove_admin') + '</button>';
          return '<tr><td>' + escapeHtml(a.email) + '</td><td>' + escapeHtml(a.code) + '</td><td><span class="badge badge-verified">' + escapeHtml(a.role) + '</span></td><td>' + new Date(a.created_at).toLocaleDateString() + '</td><td>' + action + '</td></tr>';
        }).join('') + '</tbody></table>';
      container.querySelectorAll('[data-admin-remove]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var ok = await window.HufraUI.confirm(t('admin_remove_admin_confirm'), { title: t('admin_remove_admin'), confirmLabel: t('admin_remove_admin') });
          if (!ok) return;
          try {
            await window.HufraApi.post('/admin/admins/demote', { email: btn.getAttribute('data-admin-remove') });
            window.HufraUI.showToast(t('admin_admin_removed'), 'success');
            loadAdmins();
          } catch (err) {
            window.HufraUI.showToast(err.message || t('error_generic'), 'error');
          }
        });
      });
      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      container.innerHTML = '';
    }
  }

  function initPromoteAdminForm() {
    var form = document.getElementById('promote-admin-form');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      try {
        await window.HufraApi.post('/admin/admins/promote', {
          email: document.getElementById('promote-email').value.trim(),
          role: document.getElementById('promote-role').value,
        });
        window.HufraUI.showToast(t('save'), 'success');
        form.reset();
        loadAdmins();
      } catch (err) {
        window.HufraUI.showToast(err.message || t('error_generic'), 'error');
      }
    });
  }

  async function loadAuditLog() {
    var container = document.getElementById('audit-list');
    try {
      var data = await window.HufraApi.get('/admin/audit-logs');
      container.innerHTML = '<table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th></tr></thead><tbody>' +
        data.results.map(function (r) {
          return '<tr><td>' + new Date(r.created_at).toLocaleString() + '</td><td>' + escapeHtml(r.actor_email || r.actor_code || '-') + '</td><td>' + escapeHtml(r.action) + '</td><td>' + escapeHtml(r.entity) + (r.entity_id ? ' #' + r.entity_id : '') + '</td></tr>';
        }).join('') + '</tbody></table>';
    } catch (e) {
      window.HufraUI.showToast(t('error_generic'), 'error');
    }
  }

  async function pollNotifications() {
    try {
      var data = await window.HufraApi.get('/admin/notifications');
      var countEl = document.getElementById('notif-count');
      if (data.unread_count > 0) {
        countEl.textContent = data.unread_count > 99 ? '99+' : String(data.unread_count);
        countEl.classList.remove('hidden');
      } else {
        countEl.classList.add('hidden');
      }
    } catch (e) {}
  }

  function initNotifBell() {
    document.getElementById('notif-bell').addEventListener('click', async function () {
      await window.HufraApi.post('/admin/notifications/read-all');
      pollNotifications();
      loadReports();
    });
    pollNotifications();
    notifTimer = setInterval(pollNotifications, 20000);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    var user = await guardAdmin();
    if (!user) return;
    initTabs();
    initStatusFilter();
    initRegionForm();
    initDonorForm();
    initPromoteAdminForm();
    initNotifBell();
    await loadReports();

    var focusReportId = new URLSearchParams(location.search).get('report');
    if (focusReportId) {
      openReportModal(focusReportId);
    }

    document.getElementById('report-modal').addEventListener('click', function (e) {
      if (e.target.id === 'report-modal') closeModal();
    });
  });

  function stopTimers() {
    if (notifTimer) { clearInterval(notifTimer); notifTimer = null; }
  }
  window.addEventListener('beforeunload', stopTimers);
  window.addEventListener('hufra:page-leave', stopTimers);
})();
