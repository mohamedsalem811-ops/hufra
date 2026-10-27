// Offline-First Queue Engine for HUFRA (IndexedDB + Automatic Background Sync).
(function (global) {
  'use strict';

  var DB_NAME = 'hufra_offline_db';
  var DB_VERSION = 1;
  var STORE_REPORTS = 'pending_reports';
  var STORE_ADMIN_ACTIONS = 'pending_admin_actions';
  var isSyncing = false;
  var listeners = [];

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        return reject(new Error('IndexedDB not available'));
      }
      var req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_REPORTS)) {
          db.createObjectStore(STORE_REPORTS, { keyPath: 'client_report_uuid' });
        }
        if (!db.objectStoreNames.contains(STORE_ADMIN_ACTIONS)) {
          db.createObjectStore(STORE_ADMIN_ACTIONS, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  function notifyListeners() {
    getQueueSummary().then(function (summary) {
      listeners.forEach(function (fn) {
        try { fn(summary); } catch (e) {}
      });
    });
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  async function enqueueReport(payload, photos) {
    var uuid =
      payload.client_report_uuid ||
      (global.HufraBridge && global.HufraBridge.generateClientId()) ||
      ('offline-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9));

    var record = {
      client_report_uuid: uuid,
      payload: Object.assign({}, payload, { client_report_uuid: uuid }),
      photos: (photos || []).map(function (p) {
        return {
          full: p.full,
          thumb: p.thumb,
          width: p.width,
          height: p.height,
          stage: p.stage || 'report',
        };
      }),
      created_at: new Date().toISOString(),
      attempts: 0,
      last_error: null,
    };

    var db = await openDb();
    await new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE_REPORTS, 'readwrite');
      tx.objectStore(STORE_REPORTS).put(record);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function (e) { reject(e.target.error); };
    });

    if ('serviceWorker' in navigator && 'SyncManager' in global) {
      navigator.serviceWorker.ready
        .then(function (reg) { return reg.sync.register('hufra-offline-sync'); })
        .catch(function () {});
    }

    notifyListeners();
    return record;
  }

  async function enqueueAdminAction(action) {
    var record = Object.assign({}, action, {
      created_at: new Date().toISOString(),
      attempts: 0,
    });
    var db = await openDb();
    await new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE_ADMIN_ACTIONS, 'readwrite');
      tx.objectStore(STORE_ADMIN_ACTIONS).add(record);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function (e) { reject(e.target.error); };
    });
    notifyListeners();
    return record;
  }

  async function listPendingReports() {
    try {
      var db = await openDb();
      return await new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_REPORTS, 'readonly');
        var req = tx.objectStore(STORE_REPORTS).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function (e) { reject(e.target.error); };
      });
    } catch (e) {
      return [];
    }
  }

  async function listPendingAdminActions() {
    try {
      var db = await openDb();
      return await new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_ADMIN_ACTIONS, 'readonly');
        var req = tx.objectStore(STORE_ADMIN_ACTIONS).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function (e) { reject(e.target.error); };
      });
    } catch (e) {
      return [];
    }
  }

  async function removePendingReport(uuid) {
    var db = await openDb();
    await new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE_REPORTS, 'readwrite');
      tx.objectStore(STORE_REPORTS).delete(uuid);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function (e) { reject(e.target.error); };
    });
    notifyListeners();
  }

  async function removePendingAdminAction(id) {
    var db = await openDb();
    await new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE_ADMIN_ACTIONS, 'readwrite');
      tx.objectStore(STORE_ADMIN_ACTIONS).delete(id);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function (e) { reject(e.target.error); };
    });
    notifyListeners();
  }

  async function getQueueSummary() {
    var reports = await listPendingReports();
    var adminActions = await listPendingAdminActions();
    return {
      reports: reports,
      adminActions: adminActions,
      total: reports.length + adminActions.length,
      online: navigator.onLine !== false,
      isSyncing: isSyncing,
    };
  }

  async function syncAll() {
    if (isSyncing || navigator.onLine === false) return { syncedReports: 0, syncedAdmin: 0 };
    isSyncing = true;
    notifyListeners();

    var syncedReports = 0;
    var syncedAdmin = 0;

    try {
      var reports = await listPendingReports();
      for (var i = 0; i < reports.length; i++) {
        var item = reports[i];
        try {
          var created = await global.HufraApi.post('/potholes', item.payload);
          var potholeId = created.id;
          if (!created.deduplicated && item.photos && item.photos.length) {
            for (var j = 0; j < item.photos.length; j++) {
              var photo = item.photos[j];
              var ext = photo.full && photo.full.type === 'image/jpeg' ? 'jpg' : 'webp';
              var formData = new FormData();
              formData.append('full', photo.full, 'photo.' + ext);
              formData.append('thumb', photo.thumb, 'thumb.' + ext);
              formData.append('stage', photo.stage || 'report');
              if (photo.width) formData.append('width_px', String(photo.width));
              if (photo.height) formData.append('height_px', String(photo.height));
              await global.HufraApi.postForm('/photos/' + potholeId, formData);
            }
          }
          await removePendingReport(item.client_report_uuid);
          syncedReports++;
        } catch (err) {
          if (err && err.status === 400) {
            await removePendingReport(item.client_report_uuid);
          }
        }
      }

      var adminActions = await listPendingAdminActions();
      for (var k = 0; k < adminActions.length; k++) {
        var act = adminActions[k];
        try {
          if (act.type === 'status_change') {
            await global.HufraApi.patch('/potholes/' + act.potholeId + '/status', {
              status: act.status,
              note: act.note || undefined,
            });
          } else if (act.type === 'delete_report') {
            await global.HufraApi.del('/potholes/' + act.potholeId);
          } else if (act.type === 'proof_photo') {
            var extProof = act.full && act.full.type === 'image/jpeg' ? 'jpg' : 'webp';
            var fd = new FormData();
            fd.append('full', act.full, 'photo.' + extProof);
            fd.append('thumb', act.thumb, 'thumb.' + extProof);
            fd.append('stage', act.stage);
            if (act.width) fd.append('width_px', String(act.width));
            if (act.height) fd.append('height_px', String(act.height));
            await global.HufraApi.postForm('/photos/' + act.potholeId, fd);
          }
          await removePendingAdminAction(act.id);
          syncedAdmin++;
        } catch (err) {
          if (err && (err.status === 400 || err.status === 403 || err.status === 404)) {
            await removePendingAdminAction(act.id);
          }
        }
      }
    } finally {
      isSyncing = false;
      notifyListeners();
    }

    if ((syncedReports > 0 || syncedAdmin > 0) && global.HufraUI && global.HufraUI.showToast) {
      var t = global.HufraI18n ? global.HufraI18n.t : function (x) { return x; };
      global.HufraUI.showToast(t('offline_synced_toast'), 'success');
    }

    return { syncedReports: syncedReports, syncedAdmin: syncedAdmin };
  }

  function isNetworkError(err) {
    if (navigator.onLine === false) return true;
    if (!err) return false;
    if (typeof err.status === 'number' && err.status > 0) return false;
    return err instanceof TypeError || /network|fetch|offline|failed/i.test(String(err.message || ''));
  }

  global.addEventListener('online', function () {
    notifyListeners();
    syncAll();
  });
  global.addEventListener('offline', function () {
    notifyListeners();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (event) {
      if (event.data && event.data.type === 'HUFRA_TRIGGER_SYNC') {
        syncAll();
      }
    });
  }

  global.HufraOfflineQueue = {
    enqueueReport: enqueueReport,
    enqueueAdminAction: enqueueAdminAction,
    listPendingReports: listPendingReports,
    listPendingAdminActions: listPendingAdminActions,
    removePendingReport: removePendingReport,
    getQueueSummary: getQueueSummary,
    syncAll: syncAll,
    onChange: onChange,
    isNetworkError: isNetworkError,
  };
})(window);
