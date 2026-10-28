/* 課堂畫筆（共用）
 * - 觸控筆／滑鼠畫線；偵測到觸控筆後，手指改為捲動（手掌防誤觸），可用「☝️畫／捲」切換
 * - 筆跡以頁面座標儲存（x 為頁面寬度比例、y 為頁面像素），捲動、轉向後仍貼合內容
 * - 高解析度（devicePixelRatio）、連續點位（getCoalescedEvents）、復原一筆
 *
 * 用法：
 *   var pen = CockpitPen.mount({
 *     canvas: document.getElementById('pen'),   // position:fixed 的全螢幕畫布
 *     color:  function(){ return '#fff' },       // 回傳 'erase' 代表橡皮擦
 *     width:  function(){ return 3.5 },          // 選填
 *     active: function(){ return penOn },        // 選填
 *     tools:  element,                           // 選填：自動補上「復原」「手指」按鈕的容器
 *     like:   element,                           // 選填：自動補上的按鈕沿用此按鈕的 class
 *     undoBtn: element, fingerBtn: element       // 選填：頁面已有按鈕時直接綁定
 *   });
 *   pen.clear(); pen.undo(); pen.reset();        // reset：關閉畫筆時中斷進行中的筆畫
 */
(function (global) {
  'use strict';

  function mount(o) {
    var cv = o.canvas, ctx = cv.getContext('2d');
    var strokes = [], cur = null, scrollPtr = null, raf = 0, fingerDraws = true;
    var fingerBtn = o.fingerBtn || null, undoBtn = o.undoBtn || null;

    function pageW() { return document.documentElement.clientWidth || innerWidth; }
    function dpr() { return window.devicePixelRatio || 1; }
    function toPage(e) {
      var r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) / pageW(), y: e.clientY - r.top + window.scrollY };
    }
    function size() {
      // canvas 是置換元素，只靠 inset:0 不會撐滿視窗；沒撐滿時由這裡補上
      if (cv.clientWidth < innerWidth * 0.9 || cv.clientHeight < innerHeight * 0.9) {
        cv.style.width = '100%';
        cv.style.height = '100%';
      }
      var d = dpr(), w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight;
      cv.width = Math.round(w * d);
      cv.height = Math.round(h * d);
      redraw();
    }
    function paint(st, from) {
      var d = dpr(), W = pageW(), pts = st.pts, sy = window.scrollY;
      if (!pts.length) return;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (st.c === 'erase') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = 26;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = st.c;
        ctx.lineWidth = st.w;
      }
      ctx.beginPath();
      var i = from || 0;
      if (i < 1) { ctx.moveTo(pts[0].x * W, pts[0].y - sy); i = 1; }
      else { ctx.moveTo(pts[i - 1].x * W, pts[i - 1].y - sy); }
      if (pts.length === 1) ctx.lineTo(pts[0].x * W + 0.01, pts[0].y - sy);
      for (; i < pts.length; i++) ctx.lineTo(pts[i].x * W, pts[i].y - sy);
      ctx.stroke();
    }
    function redraw() {
      raf = 0;
      var d = dpr();
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, cv.width / d, cv.height / d);
      strokes.forEach(function (st) { paint(st, 0); });
    }
    function later() { if (!raf) raf = requestAnimationFrame(redraw); }

    function label() {
      if (!fingerBtn) return;
      fingerBtn.textContent = fingerDraws ? '☝️畫' : '☝️捲';
      fingerBtn.setAttribute('aria-pressed', fingerDraws ? 'true' : 'false');
    }
    function capture(e) { try { cv.setPointerCapture(e.pointerId); } catch (_) {} }
    function isActive() { return o.active ? !!o.active() : true; }

    function makeBtn(text, title) {
      var b = document.createElement('button');
      b.type = 'button';
      b.title = title;
      b.textContent = text;
      if (o.like && o.like.className) b.className = o.like.className;
      if (o.tools) o.tools.appendChild(b);
      return b;
    }
    if (!undoBtn && o.tools) undoBtn = makeBtn('↶', '復原上一筆');
    if (!fingerBtn && o.tools) fingerBtn = makeBtn('☝️畫', '手指：畫線／捲動');
    if (undoBtn) undoBtn.addEventListener('click', function () { strokes.pop(); redraw(); });
    if (fingerBtn) fingerBtn.addEventListener('click', function () { fingerDraws = !fingerDraws; label(); });
    label();

    cv.addEventListener('pointerdown', function (e) {
      if (!isActive()) return;
      // 偵測到觸控筆：手指改為捲動（手掌防誤觸）
      if (e.pointerType === 'pen' && fingerDraws) { fingerDraws = false; label(); }
      if (e.pointerType === 'touch' && !fingerDraws) {
        scrollPtr = { id: e.pointerId, y: e.clientY };
        capture(e);
        return;
      }
      if (cur) return; // 已有一筆在畫：忽略其他手指／手掌
      cur = { id: e.pointerId, c: o.color(), w: o.width ? o.width() : 3.5, pts: [toPage(e)] };
      strokes.push(cur);
      capture(e);
      paint(cur, 0);
      e.preventDefault();
    });
    cv.addEventListener('pointermove', function (e) {
      if (scrollPtr && e.pointerId === scrollPtr.id) {
        var dy = scrollPtr.y - e.clientY;
        scrollPtr.y = e.clientY;
        window.scrollBy({ top: dy, left: 0, behavior: 'instant' });
        return;
      }
      if (!cur || e.pointerId !== cur.id) return;
      var evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
      var list = evs.length ? evs : [e];
      var from = cur.pts.length;
      list.forEach(function (ev) { cur.pts.push(toPage(ev)); });
      paint(cur, from);
    });
    ['pointerup', 'pointercancel'].forEach(function (n) {
      cv.addEventListener(n, function (e) {
        if (scrollPtr && e.pointerId === scrollPtr.id) scrollPtr = null;
        if (cur && e.pointerId === cur.id) cur = null;
      });
    });

    window.addEventListener('scroll', later, { passive: true });
    window.addEventListener('resize', size);
    if (window.ResizeObserver) new ResizeObserver(size).observe(cv);
    size();

    return {
      clear: function () { strokes.length = 0; cur = null; redraw(); },
      undo: function () { strokes.pop(); redraw(); },
      reset: function () { cur = null; scrollPtr = null; },
      redraw: redraw
    };
  }

  global.CockpitPen = { mount: mount };
})(window);
