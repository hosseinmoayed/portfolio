/* ============================================================
   Frame-sequence scrub player (SynapseX)
   ------------------------------------------------------------
   Replaces currentTime-seeking on <video> for the two scrub films:
   seeking a 15 MB H.264 every frame stutters (hardware decode +
   coalesced seeks), while an image sequence on <canvas> is exact
   and deterministic — the approach Apple-style scroll films use.

   Sequences live in frames/<name>/f001.webp … f240.webp (24 fps,
   q70). All frames load lazily in the background after first paint,
   so nothing blocks the loader.

   API:
     FrameScrub.mount({name, canvas, frames, onload})
     player.goTo(t)        t = seconds (0-based, clamped)
     player.duration       seconds
     player.loadedRatio    0..1 how many frames have arrived
     player.ready          Promise (first frame drawn)
     player.destroy()
   ============================================================ */

function FrameScrub(opts) {
  var canvas = opts.canvas;
  var ctx = canvas.getContext("2d");
  var count = opts.frames || 240;
  var fps = opts.fps || 24;
  var pad = 3;                                  // f001…f240
  var dir = "frames/" + opts.name + "/";

  var imgs = new Array(count);                  // decoded ImageBitmap/HTMLImage
  var pending = count;
  var failed = 0;                               // frames that 404'd (not "loaded")
  var lastIndex = -1;
  var drawn = false;
  var destroyed = false;

  // paint a frame index onto the canvas (cover-fit like object-fit:cover)
  function paint(i) {
    if (destroyed) return;
    var img = imgs[i];
    if (!img) return;
    var cw = canvas.clientWidth || opts.width || 1280;
    var ch = canvas.clientHeight || opts.height || 720;
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    var iw = img.width || opts.width, ih = img.height || opts.height;
    var scale = Math.max(cw / iw, ch / ih);
    var dw = iw * scale, dh = ih * scale;
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    lastIndex = i;
    drawn = true;
  }

  // nearest loaded frame at-or-before i, else at-or-after (never blank)
  function nearestLoaded(i) {
    for (var d = 0; d < count; d++) {
      if (i - d >= 0 && imgs[i - d]) return i - d;
      if (i + d < count && imgs[i + d]) return i + d;
    }
    return -1;
  }

  var firstPaint = new Promise(function (res) {
    function tryFirst() {
      var i = nearestLoaded(0);
      if (i >= 0) { paint(i); res(); return true; }
      return false;
    }
    if (!tryFirst()) {
      var iv = setInterval(function () { if (tryFirst()) clearInterval(iv); }, 60);
      setTimeout(function () { clearInterval(iv); }, 15000);   // never spin forever
    }
  });

  // background fetch — lowest-priority feel: one at a time, early frames first,
  // starting only after the page has settled (or immediately after onload)
  var fetchHead = 0;
  function pump() {
    if (destroyed) return;
    while (fetchHead < count && imgs[fetchHead]) fetchHead++;
    if (fetchHead >= count) return;
    var i = fetchHead;
    var im = new Image();
    im.decoding = "async";
    im.onload = function () {
      imgs[i] = im;
      pending--;
      if (opts.onprogress) opts.onprogress(1 - (pending + failed) / count);
      if (!drawn && i === 0) paint(0);
    };
    im.onerror = function () { imgs[i] = null; pending--; failed++; if (opts.onprogress) opts.onprogress(1 - (pending + failed) / count); };
    im.src = dir + "f" + String(i + 1).padStart(pad, "0") + ".webp";
    fetchHead++;
    // throttle: one decode per idle slice keeps the main thread responsive
    if ("requestIdleCallback" in window) requestIdleCallback(pump, { timeout: 500 });
    else setTimeout(pump, 8);
  }

  var ready = firstPaint;
  // start loading once the browser is idle, or after 1.2 s at the latest
  if ("requestIdleCallback" in window) requestIdleCallback(pump, { timeout: 1200 });
  else setTimeout(pump, 50);

  return {
    duration: count / fps,
    loadedRatio: function () { return (count - pending) / count; },
    ready: ready,
    // draw the frame at time t (seconds). Cheap: only paints on frame change.
    goTo: function (t) {
      var i = Math.max(0, Math.min(count - 1, Math.round(t * fps)));
      if (i === lastIndex && drawn) return;
      var j = nearestLoaded(i);
      if (j >= 0) paint(j);
    },
    destroy: function () {
      destroyed = true;
      imgs = null;
    }
  };
}
window.FrameScrub = FrameScrub;