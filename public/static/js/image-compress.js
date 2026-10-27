// Ultra-Compact Client-Side Image Compression Pipeline.
//
// IMPORTANT ARCHITECTURE NOTE ON DATABASE SIZE:
// 1. Photos are NEVER stored as binary/BLOB or Base64 inside the Cloudflare D1
//    SQLite database. D1 only stores a 45-byte text path (e.g. "photos/12/uuid.webp"),
//    so 10,000 photos take less than 1 MB in the D1 database.
// 2. Before uploading to Cloudflare R2, this pipeline compresses every camera
//    photo (typically 4–8 MB) right on the user's phone/browser down to:
//      - "full":  <=1280px long edge, target <=180 KB (typically 80–150 KB, >95% smaller)
//      - "thumb": <=320px long edge, target <=35 KB (typically 15–30 KB for instant map/list loading)
// 3. Automatically falls back from image/webp to image/jpeg on iOS/Safari WebViews
//    that do not support WebP canvas encoding.
(function (global) {
  'use strict';

  var FULL_MAX_DIMENSION = 1280;
  var FULL_TARGET_BYTES = 180 * 1024; // 180 KB target for fast mobile upload & minimal R2 storage
  var THUMB_MAX_DIMENSION = 320;
  var THUMB_TARGET_BYTES = 35 * 1024; // 35 KB target for instant map popups
  var MIN_QUALITY = 0.38;

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function (e) {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }

  function drawResized(img, maxDimension) {
    var width = img.naturalWidth || img.width;
    var height = img.naturalHeight || img.height;
    var scale = Math.min(1, maxDimension / Math.max(width, height));
    var targetWidth = Math.max(1, Math.round(width * scale));
    var targetHeight = Math.max(1, Math.round(height * scale));

    var canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    return { canvas: canvas, width: targetWidth, height: targetHeight };
  }

  function canvasToBlobWithMime(canvas, mime, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) { resolve(blob); }, mime, quality);
    });
  }

  async function canvasToBlob(canvas, quality) {
    var blob = await canvasToBlobWithMime(canvas, 'image/webp', quality);
    if (!blob || blob.type !== 'image/webp') {
      blob = await canvasToBlobWithMime(canvas, 'image/jpeg', quality);
    }
    return blob;
  }

  async function compressToTarget(canvas, targetBytes, startQuality) {
    var quality = startQuality || 0.78;
    var blob = await canvasToBlob(canvas, quality);
    var attempts = 0;
    while (blob && blob.size > targetBytes && quality > MIN_QUALITY && attempts < 6) {
      quality = Math.max(MIN_QUALITY, quality - 0.1);
      blob = await canvasToBlob(canvas, quality);
      attempts += 1;
    }
    return blob;
  }

  async function compressImage(file) {
    var originalBytes = file.size || 0;
    var img = await loadImage(file);
    try {
      var fullDraw = drawResized(img, FULL_MAX_DIMENSION);
      var fullBlob = await compressToTarget(fullDraw.canvas, FULL_TARGET_BYTES, 0.78);

      var thumbDraw = drawResized(img, THUMB_MAX_DIMENSION);
      var thumbBlob = await compressToTarget(thumbDraw.canvas, THUMB_TARGET_BYTES, 0.72);

      return {
        full: fullBlob,
        thumb: thumbBlob,
        width: fullDraw.width,
        height: fullDraw.height,
        originalBytes: originalBytes,
        fullBytes: fullBlob ? fullBlob.size : 0,
        thumbBytes: thumbBlob ? thumbBlob.size : 0,
      };
    } finally {
      if (img.src) URL.revokeObjectURL(img.src);
    }
  }

  global.HufraImageCompress = {
    compressImage: compressImage,
  };
})(window);
