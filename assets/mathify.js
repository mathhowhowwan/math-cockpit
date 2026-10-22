/* mathify.js — 把頁面上的數學排成課本寫法（KaTeX）
 * 1) 直接寫 LaTeX：\( \sqrt{2}\times\dfrac{1}{3} \)   （小於號請寫 \lt，避免被 HTML 當成標籤）
 * 2) 純文字也會自動轉：√(2²×15)、2√3/3、1/(2+√3)、(a+√b)²、a≥0 …
 * 3) 動態產生的內容（JS 寫入的算式、選擇題選項）也會自動處理
 * 4) <select> 的選項無法顯示公式，數學選項會自動改成按鈕組
 * 需要先載入 KaTeX（css + katex.min.js）。Canvas 內無法排版數學，請改用 HTML 輸出。
 */
(function () {
  'use strict';
  if (window.__mathify) return;
  window.__mathify = true;

  var SUPM = { '²': '2', '³': '3', '⁴': '4' };
  var OPS = { '×': '\\times ', '÷': '\\div ', '+': '+', '-': '-', '=': '=', '≠': '\\neq ', '≥': '\\geq ', '≤': '\\leq ',
    '±': '\\pm ', '≈': '\\approx ', '<': '\\lt ', '>': '\\gt ', ',': ',\\,', '.': '.' };
  var RUN = /[0-9A-Za-zπ√²³⁴×÷＋＝－−+\-=≠≥≤±≈()\/.,<> \t ]+/g;
  var QUICK = /[√²³⁴≠≥≤±≈×÷\/]|\\\(/;
  var TRIG = /[√²³⁴≠≥≤±≈×÷]/;
  var FRAC = /(?:[0-9)√]\/[0-9A-Za-z(√])|(?:[0-9A-Za-z)]\/[0-9(√])/;
  var SKIP = { script: 1, style: 1, textarea: 1, input: 1, option: 1, select: 1, code: 1, pre: 1, title: 1, noscript: 1, svg: 1, canvas: 1 };

  function toTex(src) {
    var s = src.replace(/＋/g, '+').replace(/＝/g, '=').replace(/[－−]/g, '-');
    var i = 0;
    function fail() { throw new Error('mathify'); }
    function ws() { while (i < s.length && /[ \t ]/.test(s[i])) i++; }
    function atom() {
      var c = s[i], tex, inner = null, grp = false, m;
      if (c === '(') {
        i++; var x = seq(true); if (s[i] !== ')') fail(); i++;
        var f = /\\d?frac/.test(x);
        tex = (f ? '\\left(' : '(') + x + (f ? '\\right)' : ')'); inner = x; grp = true;
      } else if (c === '√') {
        i++; var op;
        if (s[i] === '(') { i++; op = seq(true); if (s[i] !== ')') fail(); i++; }
        else {
          m = /^\d+(?:\.\d+)?/.exec(s.slice(i));
          if (m) { op = m[0]; i += m[0].length; }
          else if (/[A-Za-zπ]/.test(s[i] || '')) { op = s[i] === 'π' ? '\\pi ' : s[i]; i++; }
          else fail();
        }
        tex = '\\sqrt{' + op + '}';
      } else if (/[0-9]/.test(c || '')) {
        m = /^\d+(?:\.\d+)?/.exec(s.slice(i)); tex = m[0]; i += m[0].length;
      } else if (c === 'π') { tex = '\\pi '; i++; }
      else if (/[A-Za-z]/.test(c || '')) { tex = c; i++; }
      else fail();
      var sup = false;
      while (i < s.length && SUPM[s[i]]) { tex += '^{' + SUPM[s[i]] + '}'; i++; sup = true; }
      return { tex: tex, inner: (grp && !sup) ? inner : tex };
    }
    function startsAtom(ch) { return /[0-9A-Za-zπ√(]/.test(ch || ''); }
    function term() {
      var p = [atom()];
      while (i < s.length && startsAtom(s[i])) p.push(atom());
      ws();
      if (s[i] === '/') {
        i++; ws();
        if (!startsAtom(s[i])) fail();
        var d = atom();
        var num = p.length === 1 ? p[0].inner : p.map(function (a) { return a.tex; }).join('');
        return '\\dfrac{' + num + '}{' + d.inner + '}';
      }
      return p.map(function (a) { return a.tex; }).join('');
    }
    function seq(inParen) {
      var out = '';
      for (;;) {
        ws(); if (i >= s.length) break;
        var c = s[i];
        if (c === ')') { if (inParen) break; fail(); }
        if (OPS[c] !== undefined) { out += OPS[c]; i++; continue; }
        out += term();
      }
      return out;
    }
    var r = seq(false);
    if (i < s.length) fail();
    return r;
  }

  function render(tex) {
    try { return window.katex.renderToString(tex, { throwOnError: true, strict: 'ignore' }); }
    catch (e) { return null; }
  }
  function mj(html) {
    var sp = document.createElement('span'); sp.className = 'mj' + (html.indexOf('mfrac') > -1 ? ' mj-f' : ''); sp.innerHTML = html; return sp;
  }
  function count(str, ch) { return str.split(ch).length - 1; }

  function convertRun(str) {
    var m = /^(\s*(?:[A-D][.．]|Q\d{1,2}|\d{1,2}[.．]|\(\d{1,2}\))\s+)?([\s\S]*)$/.exec(str);
    var pre = m[1] || '', body = m[2];
    var lead = /^[\s.,]*/.exec(body)[0]; body = body.slice(lead.length);
    var trail = /[\s.,]*$/.exec(body)[0]; body = body.slice(0, body.length - trail.length);
    while (body && body[body.length - 1] === ')' && count(body, ')') > count(body, '(')) { trail = ')' + trail; body = body.slice(0, -1); }
    while (body && body[0] === '(' && count(body, '(') > count(body, ')')) { lead = lead + '('; body = body.slice(1); }
    if (!body || !(TRIG.test(body) || FRAC.test(body)) || !/[0-9A-Za-z√π]/.test(body)) return null;
    var tex; try { tex = toTex(body); } catch (e) { return null; }
    var html = render(tex); if (!html) return null;
    var out = [], t = pre + lead;
    if (t) out.push(document.createTextNode(t));
    out.push(mj(html));
    if (trail) out.push(document.createTextNode(trail));
    return out;
  }

  function allowed(node) {
    for (var p = node.parentNode; p && p.nodeType === 1; p = p.parentNode) {
      var tn = p.tagName.toLowerCase();
      if (SKIP[tn] || (p.classList && (p.classList.contains('katex') || p.classList.contains('mj'))) || p.hasAttribute('data-nomath')) return false;
    }
    return true;
  }

  function processText(node) {
    var t = node.nodeValue;
    if (!t || !QUICK.test(t) || !node.parentNode || !allowed(node)) return;
    var frag = document.createDocumentFragment(), changed = false;
    var parts = t.split(/\\\(([\s\S]*?)\\\)/);
    for (var k = 0; k < parts.length; k++) {
      var p = parts[k];
      if (k % 2 === 1) {
        var h = render(p);
        if (h) { frag.appendChild(mj(h)); changed = true; }
        else frag.appendChild(document.createTextNode('\\(' + p + '\\)'));
        continue;
      }
      var last = 0, m; RUN.lastIndex = 0;
      while ((m = RUN.exec(p))) {
        var conv = convertRun(m[0]);
        if (!conv) continue;
        if (m.index > last) frag.appendChild(document.createTextNode(p.slice(last, m.index)));
        conv.forEach(function (n) { frag.appendChild(n); });
        last = m.index + m[0].length; changed = true;
      }
      if (last < p.length) frag.appendChild(document.createTextNode(p.slice(last)));
    }
    if (changed) node.parentNode.replaceChild(frag, node);
  }

  function enhanceSelects(root) {
    if (!root.querySelectorAll) return;
    root.querySelectorAll('select:not([data-msel])').forEach(function (sel) {
      var txt = Array.prototype.map.call(sel.options, function (o) { return o.text; }).join('|');
      if (!(/[√²³⁴]/.test(txt) || /[0-9A-Za-z)]\s*\/\s*[0-9A-Za-z(√]/.test(txt))) return;
      sel.setAttribute('data-msel', '1'); sel.style.display = 'none';
      var g = document.createElement('div'); g.className = 'msel'; g.setAttribute('role', 'radiogroup');
      Array.prototype.forEach.call(sel.options, function (o) {
        var b = document.createElement('button'); b.type = 'button';
        b.className = 'msel-btn' + (o.selected ? ' on' : ''); b.setAttribute('role', 'radio');
        b.textContent = o.text;
        b.addEventListener('click', function () {
          sel.value = o.value;
          Array.prototype.forEach.call(g.children, function (x) { x.classList.toggle('on', x === b); });
          sel.dispatchEvent(new Event('input', { bubbles: true }));
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        });
        g.appendChild(b);
      });
      sel.parentNode.insertBefore(g, sel.nextSibling);
      Array.prototype.forEach.call(g.querySelectorAll('button'), function (b) { if (b.firstChild) processText(b.firstChild); });
    });
  }

  function scan(root) {
    if (root.nodeType === 3) { processText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), list = [], n;
    while ((n = w.nextNode())) list.push(n);
    list.forEach(processText);
    enhanceSelects(root);
  }

  var busy = false, mo = null;
  function start() {
    if (!window.katex) return false;
    var st = document.createElement('style');
    st.textContent = '.mj .katex{font-size:1.1em}.mj-f{display:inline-block;margin:.22em 0;vertical-align:middle}.msel{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}' +
      '.msel-btn{border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.08);color:inherit;border-radius:10px;padding:6px 12px;cursor:pointer;font:inherit;min-height:44px}' +
      '.msel-btn.on{background:#f5d778;color:#16261a;border-color:#f5d778}';
    document.head.appendChild(st);
    mo = new MutationObserver(function (ms) {
      if (busy) return; busy = true;
      try {
        ms.forEach(function (m) {
          if (m.type === 'characterData') processText(m.target);
          else m.addedNodes.forEach(function (n) { if (n.isConnected) scan(n); });
        });
      } catch (e) {}
      mo.takeRecords(); busy = false;
    });
    busy = true; scan(document.body); mo.takeRecords(); busy = false;
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    return true;
  }

  function init() { if (!start()) window.addEventListener('load', start); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.mathify = { scan: scan, toTex: toTex };
})();
