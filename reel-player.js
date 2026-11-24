/* Reel player: draws a 1080×1920 animated reel on a canvas at any time t.
   Self-contained on purpose: the same file is inlined into the exported HTML, so no imports and no build step.
   Ported from native/Studio/Video (Scenes.swift, ReelFrame.swift). */
(function () {
  'use strict'
  var W = 1080, H = 1920, WPS = 170 / 60, LEAD = 0.15, TAIL = 1.2
  var FONT = 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  var PI = Math.PI

  /* ---------- scenes catalogue (ids match SceneKind in the native app) ---------- */
  var META = {
    distribuzione: ['Soldi distribuiti', 'Distribuzione'],
    accumulo: ['Soldi nella cassaforte', 'Accumulo'],
    crescita: ['Grafico che sale', ''],
    calo: ['Grafico che scende', ''],
    interesse: ['Interesse composto', 'Interesse composto'],
    commissioni: ['Commissioni che erodono', 'Commissioni'],
    tasse: ['Tasse e scadenze', 'Scadenza'],
    minusvalenze: ['Bilancia perdite e guadagni', 'Minusvalenze'],
    diversificazione: ['Torta che si divide', 'Diversificazione'],
    confronto: ['A contro B', ''],
    domanda: ['Punto di domanda', ''],
    checklist: ['Lista di controllo', 'Da ricordare'],
    app: ['Telefono con il portafoglio', ''],
    protezione: ['Scudo', ''],
    tempo: ['Anni che passano', 'Tempo'],
    obiettivo: ['Bersaglio', ''],
    errore: ['Attenzione', 'Attenzione'],
    cta: ['Logo e invito', ''],
  }
  var IDS = Object.keys(META)

  /* ---------- keyword guess (SceneKind.guesses) ---------- */
  function guesses(text, label) {
    var s = ' ' + String(text || '').toLowerCase() + ' ', l = String(label || '').toLowerCase()
    var has = function (ks) { return ks.some(function (k) { return s.indexOf(k) >= 0 }) }
    var rules = [
      [l.indexOf('cta') >= 0, 'cta'],
      [has(['distribuzion']) && has(['accumul']), 'confronto'],
      [has([' vs ', ' contro ', 'differenza tra', 'confront']), 'confronto'],
      [has(['accumul', 'reinvest', 'cassaforte']), 'accumulo'],
      [has(['distribuzion', 'dividend', 'cedol', 'stacca', 'distribui', 'incass']), 'distribuzione'],
      [has(['minusvalen', 'compensa', 'plusvalen']), 'minusvalenze'],
      [has(['commission', 'costi', 'costo', ' ter ', 'spese']), 'commissioni'],
      [has(['tass', 'scadenz', 'fisco', 'fiscal', 'impost', 'dichiarazione', '26%']), 'tasse'],
      [has(['interesse composto', 'compost', 'palla di neve']), 'interesse'],
      [has(['diversific', 'paniere', 'allocazion', 'settori']), 'diversificazione'],
      [has(['errore', 'errori', 'sbagli', 'attenzione', 'evita']), 'errore'],
      [has(['proteg', 'scudo', 'al sicuro', 'rischio']), 'protezione'],
      [has(['obiettiv', 'traguard', 'pension', 'meta ']), 'obiettivo'],
      [has(['crollo', 'crolla', 'scende', 'ribass', 'calo', 'perdit']), 'calo'],
      [has(['cresc', 'sale ', 'salire', 'rendiment', 'guadagn']), 'crescita'],
      [has([' anni', ' anno', 'l’anno', "l'anno", 'tempo', 'lungo periodo', 'pazienza']), 'tempo'],
      [has([' app', 'portafoglio', 'yourvest', 'telefono']), 'app'],
      [has(['passi', 'regole', 'prima di', 'controlla']), 'checklist'],
      [l.indexOf('hook') >= 0 || s.indexOf('?') >= 0, 'domanda'],
      [has(['€', 'euro', '%']), 'interesse'],
      [true, 'crescita'], [true, 'app'], [true, 'checklist'],
    ]
    var out = []
    rules.forEach(function (r) { if (r[0] && out.indexOf(r[1]) < 0) out.push(r[1]) })
    return out
  }
  /** Best scene for a line, never the same as the previous line's scene. */
  function guess(text, label, prev) {
    var g = guesses(text, label)
    for (var i = 0; i < g.length; i++) if (g[i] !== prev) return g[i]
    return g[0]
  }

  /** Amount or percentage written in the line ("€ 10.000", "3%"), '' when there is none: scenes never invent figures. */
  function numberIn(text) {
    var pats = [/€\s?\d[\d.,]*/i, /\d[\d.,]*\s?(euro|€)/i, /\d+([.,]\d+)?\s?%/]
    for (var i = 0; i < pats.length; i++) {
      var m = String(text || '').match(pats[i])
      if (!m) continue
      var v = m[0].replace(/euro/i, '').replace('€', '').trim().replace(/[.,]+$/, '')
      return i === 2 ? v.replace(/\s/g, '') : '€ ' + v
    }
    return ''
  }
  function amount(s) {
    var d = String(s || '').replace(/[^\d.,]/g, '')
    if (!d) return null
    var v = parseFloat(d.replace(/\./g, '').replace(',', '.')) // Italian: dots group thousands
    return isFinite(v) ? v : null
  }
  function euro(v) { return '€ ' + Math.round(v).toLocaleString('it-IT') }

  /** Caption pages: at most 6 words / ~28 characters, breaking after punctuation. */
  function pages(ws) {
    var out = [], start = 0, chars = 0
    ws.forEach(function (w, i) {
      chars += w.length + 1
      var n = i - start + 1, last = w.slice(-1)
      var punct = '.!?:;'.indexOf(last) >= 0 || (last === ',' && n >= 3)
      if (punct || n >= 6 || chars >= 28 || i === ws.length - 1) { out.push([start, i + 1]); start = i + 1; chars = 0 }
    })
    return out
  }

  /* ---------- colours ---------- */
  function hex(c) {
    var s = String(c || '').trim().replace('#', '')
    if (/^[0-9a-f]{3}$/i.test(s)) s = s.replace(/./g, '$&$&')
    if (!/^[0-9a-f]{6}$/i.test(s)) return null
    var n = parseInt(s, 16)
    return [n >> 16 & 255, n >> 8 & 255, n & 255]
  }
  function toHex(p) { return '#' + p.map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2) }).join('') }
  function mix(a, b, x) { var p = hex(a), q = hex(b); return toHex([0, 1, 2].map(function (i) { return p[i] + (q[i] - p[i]) * x })) }
  function A(c, a) { var p = hex(c); return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + Math.max(0, Math.min(1, a)) + ')' }
  function lum(c) { var p = hex(c); return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255 }
  function palette(k) {
    k = k || {}
    var green = hex(k.highlight) ? toHex(hex(k.highlight)) : '#1DB86A'
    var blue = hex(k.accent) ? toHex(hex(k.accent)) : '#4C8DFF'
    // white captions and scenes need a dark ground: the brand background, else its main colour, else navy
    var bg = [k.background, k.main].filter(function (c) { return hex(c) && lum(toHex(hex(c))) <= 0.3 }).map(function (c) { return toHex(hex(c)) })[0] || '#0F1729'
    var tint = function (w, b) { return mix(mix(bg, '#ffffff', w), blue, b) }
    return {
      navy: bg, navy2: tint(0.03, 0.1), panel: tint(0.06, 0.14), steel: tint(0.12, 0.2), steelHi: tint(0.2, 0.25), deep: mix(bg, '#000000', 0.35),
      green: green, greenHi: mix(green, '#ffffff', 0.15), greenLo: mix(green, '#000000', 0.3), blue: blue,
      red: '#E5484D', gold: '#F4C542', goldLo: '#C9971C', purple: '#8E6CFF', teal: '#2EC4B6',
    }
  }

  /* ---------- maths of time: every scene is a pure function of t ---------- */
  function clamp01(x) { return Math.min(Math.max(x, 0), 1) }
  function prog(t, a, b) { return b <= a ? (t >= a ? 1 : 0) : clamp01((t - a) / (b - a)) }
  function ease(x) { x = clamp01(x); return x * x * (3 - 2 * x) }
  function easeOut(x) { return 1 - Math.pow(1 - clamp01(x), 3) }
  function easeIn(x) { return Math.pow(clamp01(x), 2) }
  function back(x) { x = clamp01(x); var c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2) }
  function lerp(a, b, x) { return a + (b - a) * x }
  function frac(x) { return x - Math.floor(x) }
  var sin = Math.sin, cos = Math.cos

  /* ---------- drawing primitives (c = current context, P = current palette) ---------- */
  var c = null, P = palette(), BRAND = { name: '', logo: null }
  function rr(x, y, w, h, r) {
    if (w < 0) { x += w; w = -w }
    if (h < 0) { y += h; h = -h }
    var a = (Array.isArray(r) ? r : [r, r, r, r]).map(function (v) { return Math.max(0, Math.min(v, w / 2, h / 2)) })
    c.beginPath(); c.moveTo(x + a[0], y)
    c.lineTo(x + w - a[1], y); c.arcTo(x + w, y, x + w, y + a[1], a[1])
    c.lineTo(x + w, y + h - a[2]); c.arcTo(x + w, y + h, x + w - a[2], y + h, a[2])
    c.lineTo(x + a[3], y + h); c.arcTo(x, y + h, x, y + h - a[3], a[3])
    c.lineTo(x, y + a[0]); c.arcTo(x, y, x + a[0], y, a[0]); c.closePath()
  }
  function circ(x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0, r), 0, 2 * PI) }
  function ell(x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, 2 * PI) }
  function path(pts, close) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); if (close) c.closePath() }
  function fill(s) { c.fillStyle = s; c.fill() }
  function stroke(s, w, cap, join) { c.strokeStyle = s; c.lineWidth = w; c.lineCap = cap || 'butt'; c.lineJoin = join || 'miter'; c.stroke() }
  function grad(a, b, x, y, w, h) { var g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, a); g.addColorStop(1, b); return g }
  /** Polyline drawn up to fraction p of its length (SwiftUI trimmedPath). */
  function poly(pts, p, s, w) {
    p = clamp01(p); if (p <= 0) return
    var L = [0]
    for (var i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    var tot = L[L.length - 1] * p
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1])
    for (i = 1; i < pts.length; i++) {
      if (L[i] <= tot) { c.lineTo(pts[i][0], pts[i][1]); continue }
      var f = (tot - L[i - 1]) / ((L[i] - L[i - 1]) || 1)
      c.lineTo(lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)); break
    }
    stroke(s, w, 'round', 'round')
  }
  function quad(a, m, b, n) { var o = []; for (var i = 0; i <= n; i++) { var e = i / n; o.push([(1 - e) * (1 - e) * a[0] + 2 * (1 - e) * e * m[0] + e * e * b[0], (1 - e) * (1 - e) * a[1] + 2 * (1 - e) * e * m[1] + e * e * b[1]]) } return o }
  function font(size, weight) { return (weight || 800) + ' ' + size + 'px ' + FONT }
  /** Text centred on a point, shrunk to fit maxW. */
  function label(s, size, color, x, y, maxW, weight) {
    s = String(s); maxW = maxW || 860
    c.font = font(size, weight); var w = c.measureText(s).width
    if (w > maxW) c.font = font(size * maxW / w, weight)
    c.fillStyle = color || '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s, x, y)
  }
  function glow(x, y, r, color, a) {
    var g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, A(color, a == null ? 0.35 : a)); g.addColorStop(1, A(color, 0))
    circ(x, y, r); fill(g)
  }
  function ring(x, y, r, s, w) { circ(x, y, r); stroke(s, w) }
  function note(x, y, w, ang, al) {
    c.save(); c.globalAlpha *= al == null ? 1 : clamp01(al); c.translate(x, y); c.rotate(ang || 0)
    var h = w * 0.52
    rr(-w / 2, -h / 2 + 6, w, h, 12); fill('rgba(0,0,0,.25)')
    rr(-w / 2, -h / 2, w, h, 12); fill(grad(P.greenHi, P.greenLo, -w / 2, -h / 2, w, h))
    rr(-w / 2 + w * 0.05, -h / 2 + w * 0.05, w * 0.9, h - w * 0.1, 7); stroke('rgba(255,255,255,.5)', Math.max(2, w * 0.018))
    circ(0, 0, h * 0.3); fill('rgba(255,255,255,.92)')
    label('€', h * 0.4, P.greenLo, 0, 0)
    c.restore()
  }
  function coin(x, y, r, spin, al) {
    c.save(); c.globalAlpha *= al == null ? 1 : clamp01(al); c.translate(x, y); c.scale(Math.max(0.18, Math.abs(cos(spin || 0))), 1)
    circ(0, 0, r); fill(P.goldLo); circ(0, -r * 0.06, r * 0.86); fill(P.gold)
    label('€', r * 0.95, P.goldLo, 0, -r * 0.04)
    c.restore()
  }
  function flatCoin(x, y, w) {
    var h = w * 0.32
    ell(x, y + h * 0.35, w / 2, h / 2); fill(P.goldLo)
    ell(x, y, w / 2, h / 2); fill(P.gold)
    ell(x, y, w * 0.32, h * 0.3); stroke(A(P.goldLo, 0.6), 3)
  }
  function person(x, y, color) { circ(x, y, 46); fill(color); rr(x - 86, y + 58, 172, 132, [80, 80, 18, 18]); fill(color) }
  function withT(x, y, s, fn) { c.save(); c.translate(x, y); c.scale(s, s); fn(); c.restore() }

  /* ---------- scenes: 900×900 space, t runs from 0 to dur while the line is spoken ---------- */
  var S = {}
  S.distribuzione = function (t, dur, sh) {
    var xs = [160, 450, 740], headY = 600, cols = ['#DCE6FF', '#C9F2DC', '#FFE9B8']
    var enter = back(prog(t, 0, 0.45))
    glow(450, 170, 300, P.green, 0.22)
    c.save(); c.translate(450, 170); c.scale(enter, enter); c.translate(-450, -170)
    rr(260, 60, 380, 220, 36); fill(grad(P.steelHi, P.panel, 260, 60, 380, 220)); stroke(P.green, 7)
    ;[40, 64, 52, 88].forEach(function (h, i) { rr(300 + i * 30, 230 - h, 20, h, 5); fill(A(P.green, 0.9)) })
    label(sh.alt || 'ETF', 50, '#fff', 520, 150, 210)
    rr(380, 262, 140, 14, 7); fill(P.navy)
    c.restore()
    // money flying out to the people, one every quarter of a second
    var landed = [0, 0, 0], lastLand = [-9, -9, -9], step = 0.24, fly = 0.9
    for (var i = 0; i < 80; i++) {
      var t0 = 0.4 + i * step
      if (t0 > Math.max(dur - 0.6, 1.2)) break
      var k = [1, 0, 2, 0, 2, 1][i % 6], x = prog(t, t0, t0 + fly)
      if (x >= 1) { landed[k]++; lastLand[k] = t0 + fly; continue }
      if (x <= 0) continue
      var e = easeIn(x) * 0.35 + x * 0.65
      // out of the slot, a small toss, down into the person's hands
      var px = (1 - e) * (1 - e) * 450 + 2 * (1 - e) * e * (450 + xs[k]) / 2 + e * e * xs[k]
      var py = (1 - e) * (1 - e) * 300 + 2 * (1 - e) * e * 250 + e * e * (headY - 110)
      var grow = lerp(0.35, 1, easeOut(prog(x, 0, 0.25)))
      if (i % 2 === 0) note(px, py, 130 * grow, sin(i + t * 5) * 0.5); else coin(px, py, 32 * grow, t * 9 + i)
    }
    for (k = 0; k < 3; k++) {
      var since = t - lastLand[k]
      if (since < 0.5) ring(xs[k], headY, 60 + since * 140, A(P.green, 1 - since * 2), 8)
      person(xs[k], headY, cols[k])
      for (var j = 0; j < Math.min(landed[k], 7); j++) flatCoin(xs[k], headY + 230 - j * 16, 96)
      if (landed[k] > 0) withT(xs[k], headY - 108, back(prog(since, 0, 0.3)), function () { rr(-58, -30, 116, 60, 30); fill(P.green); label('+€', 36, '#fff', 0, 0) })
    }
  }
  S.accumulo = function (t, dur, sh) {
    var ox = 264, oy = 284, ow = 372, oh = 362 // the opening, inset 54 inside the 480×470 safe at 210,230
    var closeAt = Math.max(Math.min(dur * 0.72, dur - 1.1), 1.6)
    var close = back(prog(t, closeAt, closeAt + 0.55))
    var target = sh.number && sh.number.indexOf('%') < 0 ? amount(sh.number) : null
    rr(250, 770, 400, 100, 28); fill('rgba(0,0,0,.45)'); stroke(A(P.green, 0.7), 4)
    var f = easeOut(prog(t, 0.3, closeAt + 0.3))
    if (target != null) label(euro(target * f), 60, P.greenHi, 450, 820, 360)
    else { rr(290, 806, 320, 28, 14); fill('rgba(255,255,255,.12)'); if (f > 0) { rr(290, 806, 320 * f, 28, 14); fill(P.greenHi) } } // no amount in the line: a gauge, not an invented figure
    glow(450, 470, 360, P.blue, 0.18)
    rr(250, 690, 80, 40, 10); fill(P.steel); rr(570, 690, 80, 40, 10); fill(P.steel)
    rr(210, 230, 480, 470, 44); fill(grad(P.steelHi, P.steel, 210, 230, 480, 470)); stroke('rgba(255,255,255,.25)', 5)
    rr(ox, oy, ow, oh, 26); fill(P.deep)
    var step = 0.3, fall = 0.85, inside = 0, i
    for (i = 0; i < 60; i++) { var t0 = 0.25 + i * step; if (t0 + fall > closeAt + 0.1) break; if (t >= t0 + fall) inside++ }
    for (var j = 0; j < Math.min(inside, 14); j++) {
      var nx = ox + 30 + (j % 2) * 14, ny = oy + oh - 40 - j * 15, nw = ow - 74
      rr(nx, ny, nw, 34, 6); fill(grad(P.greenHi, P.greenLo, nx, ny, nw, 34))
      rr(nx + 6, ny + 6, nw - 12, 22, 4); stroke('rgba(255,255,255,.35)', 2)
    }
    // door, hinged on the left edge of the opening
    var hx = ox, top = oy - 6, bottom = oy + oh + 6, dw = lerp(-120, ow, close), skew = 46 * (1 - Math.min(close, 1))
    path([[hx, top], [hx + dw, top - skew], [hx + dw, bottom + skew], [hx, bottom]], true)
    fill(close > 0.15 ? P.steelHi : mix(P.steel, P.blue, 0.15)); stroke('rgba(255,255,255,.3)', 4)
    if (close > 0.55) {
      var cx = hx + dw / 2, cy = (top + bottom) / 2, spin = (t - closeAt) * 5
      ring(cx, cy, 74, 'rgba(255,255,255,.75)', 10)
      for (var k = 0; k < 8; k++) { var a = spin + k * PI / 4; path([[cx + cos(a) * 44, cy + sin(a) * 44], [cx + cos(a) * 64, cy + sin(a) * 64]]); stroke('rgba(255,255,255,.75)', 8, 'round') }
      circ(cx, cy, 22); fill('rgba(255,255,255,.85)')
      var lock = prog(t, closeAt + 0.6, closeAt + 0.9)
      if (lock > 0) { circ(ox + ow - 40, oy + 40, 16); fill(A(P.green, lock)); glow(ox + ow - 40, oy + 40, 60, P.green, 0.5 * lock) }
    }
    // notes falling in from the top, shrinking as they go inside
    for (i = 0; i < 60; i++) {
      t0 = 0.25 + i * step
      if (t0 + fall > closeAt + 0.1) break
      var x = prog(t, t0, t0 + fall)
      if (x <= 0 || x >= 1) continue
      note(450 + sin(i * 2.3) * 70 * (1 - x), lerp(10, oy + oh / 2, easeIn(x)), lerp(170, 110, x), sin(i * 1.7 + t * 3) * 0.35 * (1 - x), prog(x, 0, 0.12) * (1 - prog(x, 0.75, 1)))
    }
  }
  function chart(up) {
    return function (t, dur, sh) {
      var vals = up ? [0.08, 0.14, 0.1, 0.22, 0.18, 0.32, 0.28, 0.44, 0.38, 0.55, 0.5, 0.68, 0.62, 0.8, 0.92]
        : [0.88, 0.84, 0.86, 0.72, 0.76, 0.62, 0.66, 0.5, 0.54, 0.42, 0.46, 0.3, 0.34, 0.2, 0.12]
      var color = up ? P.green : P.red, ax = 90, ay = 160, aw = 720, ah = 600
      for (var k = 0; k <= 4; k++) { var y = ay + k * ah / 4; path([[ax, y], [ax + aw, y]]); stroke('rgba(255,255,255,.08)', 3) }
      var pts = vals.map(function (v, i) { return [ax + i / (vals.length - 1) * aw, ay + ah - v * ah] })
      var f = easeOut(prog(t, 0.15, Math.max(0.9, dur * 0.75))) * (pts.length - 1), n = Math.floor(f)
      var shown = pts.slice(0, n + 1)
      if (n < pts.length - 1) { var a = pts[n], b = pts[n + 1], x = f - n; shown.push([a[0] + (b[0] - a[0]) * x, a[1] + (b[1] - a[1]) * x]) }
      var tip = shown[shown.length - 1]
      path([[ax, ay + ah]].concat(shown, [[tip[0], ay + ah]]), true)
      var g = c.createLinearGradient(0, ay, 0, ay + ah); g.addColorStop(0, A(color, 0.45)); g.addColorStop(1, A(color, 0)); fill(g)
      path(shown); stroke(color, 14, 'round', 'round')
      glow(tip[0], tip[1], 70 + 10 * sin(t * 6), color, 0.6)
      circ(tip[0], tip[1], 18); fill('#fff'); stroke(color, 6)
      var tag = sh.number || (up ? '+' : '−'), bw = Math.max(110, tag.length * 30 + 50)
      var bx = Math.min(Math.max(tip[0], ax + bw / 2), ax + aw - bw / 2), by = up ? tip[1] - 80 : tip[1] + 80
      rr(bx - bw / 2, by - 34, bw, 68, 34); fill(color); label(tag, 40, '#fff', bx, by, bw - 24)
    }
  }
  S.crescita = chart(true)
  S.calo = chart(false)
  S.interesse = function (t, dur, sh) {
    var heights = [2, 3, 4, 6, 9, 14], total = 38, span = Math.max(dur * 0.75 - 0.3, 1.2), idx = 0
    heights.forEach(function (h, k) {
      var x = 145 + k * 122
      for (var j = 0; j < h; j++) {
        var t0 = 0.3 + idx / total * span; idx++
        var a = prog(t, t0, t0 + 0.22)
        if (a > 0) flatCoin(x, 790 - j * 26 - (1 - easeIn(a)) * 60, 98)
      }
      label(String(k + 1), 34, 'rgba(255,255,255,.6)', x, 850, 860, 700)
    })
    var grow = ease(prog(t, 0.6, 0.6 + span))
    c.setLineDash([26, 18]); poly(quad([110, 700], [620, 700], [790, 210], 40), grow, P.green, 12); c.setLineDash([])
    if (grow > 0.97) { path([[752, 222], [798, 200], [784, 252]]); stroke(P.green, 12, 'round', 'round') }
    if (sh.number) { rr(120, 120, 260, 80, 40); fill(P.green); label(sh.number, 44, '#fff', 250, 160, 230) }
  }
  S.commissioni = function (t, dur, sh) {
    var fx = 100, fy = 330, fw = 700, fh = 170, pct = 30 // illustrative bar length only, never printed as a figure
    var end = Math.max(1.2, dur * 0.82), bite = ease(prog(t, 0.5, end)), keptW = fw * (1 - pct / 100 * bite)
    c.setLineDash([18, 12]); rr(fx, fy, fw, fh, 30); stroke(A(P.red, 0.7), 5); c.setLineDash([])
    c.save(); c.beginPath(); c.rect(fx, fy - 10, keptW, fh + 20); c.clip()
    rr(fx, fy, fw, fh, 30); fill(grad(P.greenHi, P.greenLo, fx, fy, fw, fh))
    for (var k = 0; k < 8; k++) { var x = fx + 44 + k * 88; rr(x - 32, fy + 34, 64, fh - 68, 10); stroke('rgba(255,255,255,.35)', 3); label('€', 46, 'rgba(255,255,255,.85)', x, fy + fh / 2) }
    c.restore()
    for (var i = 0; i < 40; i++) {
      var t0 = 0.5 + i * 0.32
      if (t0 > end) break
      var p = prog(t, t0, t0 + 0.9)
      if (p <= 0 || p >= 1) continue
      var w0 = fw * (1 - pct / 100 * ease(prog(t0, 0.5, end)))
      c.save(); c.globalAlpha *= 1 - p; c.translate(fx + w0 + 40 * p + 30, fy + fh / 2 - 260 * easeOut(p) + (i % 3) * 30); c.rotate(p * 2.4 * (i % 2 === 0 ? 1 : -1))
      rr(-30, -40, 60, 80, 12); fill(P.red); label('−', 44, '#fff', 0, 0)
      c.restore()
    }
    label(sh.number ? '−' + sh.number : '−€', 120, P.red, 450, 660)
    label(sh.number ? 'di costi' : 'di soldi in meno', 40, 'rgba(255,255,255,.7)', 450, 760, 860, 700)
  }
  S.tasse = function (t, dur, sh) {
    var day = sh.day || 30, cx = 250, cy = 120, cw = 400, ch = 460, flips = 4, every = 0.38
    var done = Math.min(flips, Math.floor(Math.max(0, t - 0.3) / every))
    function page(d) {
      rr(cx, cy + 10, cw, ch, 34); fill('rgba(0,0,0,.3)')
      rr(cx, cy, cw, ch, 34); fill('#fff')
      rr(cx, cy, cw, 120, [34, 34, 0, 0]); fill(P.red)
      ;[cx + 100, cx + cw - 100].forEach(function (x) { rr(x - 14, cy - 30, 28, 70, 14); fill('#D9DEE8') })
      label(String(Math.max(1, d)), 210, P.navy, cx + cw / 2, cy + 300)
    }
    page(done < flips ? day - flips + done + 1 : day)
    if (done < flips) {
      // the torn page flies off up-left and is gone before the next one tears
      var x = frac(Math.max(0, t - 0.3) / every), f = easeOut(prog(x, 0, 0.7))
      c.save(); c.globalAlpha *= 1 - prog(x, 0, 0.5)
      c.translate(cx + cw / 2, cy); c.rotate(-0.7 * f); c.translate(-cx - cw / 2 - 260 * f, -cy - 420 * f)
      page(day - flips + done); c.restore()
    }
    var left = flips - done
    label(left === 0 ? 'Oggi' : left === 1 ? '−1 giorno' : '−' + left + ' giorni', 64, left === 0 ? P.red : '#fff', 450, 680)
    var a0 = Math.max(0.3 + flips * every + 0.2, dur * 0.5), st = prog(t, a0, a0 + 0.25)
    if (st > 0) {
      var s = lerp(2.4, 1, easeIn(st))
      c.save(); c.globalAlpha *= st; c.translate(450, 430); c.rotate(-14 * PI / 180); c.scale(s, s)
      rr(-230, -62, 460, 124, 20); fill('rgba(255,255,255,.85)'); stroke(P.red, 12)
      label('SCADENZA', 72, P.red, 0, 0, 420)
      c.restore()
    }
  }
  S.minusvalenze = function (t, dur) {
    var px = 450, py = 250, gap = Math.max(0.5, dur * 0.18), drops = [0.5, 0.5 + gap, 0.5 + 2 * gap]
    var bal = drops.reduce(function (s, d) { return s + ease(prog(t, d + 0.45, d + 0.9)) }, 0) / 3
    var since = t - (drops[2] + 0.9), wobble = since > 0 ? sin(since * 10) * 0.05 * Math.exp(-since * 3) : 0
    var a = 0.3 * (1 - bal) + wobble
    rr(438, py, 24, 560, 12); fill(P.steelHi); rr(320, 790, 260, 36, 18); fill(P.steelHi)
    var L = [px - 320 * cos(a), py + 320 * sin(a)], R = [px + 320 * cos(a), py - 320 * sin(a)]
    path([L, R]); stroke('rgba(255,255,255,.9)', 18, 'round')
    circ(px, py, 24); fill(P.gold)
    function pan(p) {
      var bx = p[0], by = p[1] + 200
      c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(bx - 100, by); c.moveTo(p[0], p[1]); c.lineTo(bx + 100, by); stroke('rgba(255,255,255,.5)', 4)
      c.beginPath(); c.moveTo(bx - 120, by); c.quadraticCurveTo(bx, by + 70, bx + 120, by); fill('rgba(255,255,255,.9)')
      return [bx, by]
    }
    var lb = pan(L), rb = pan(R)
    rr(lb[0] - 80, lb[1] - 128, 160, 128, 18); fill(P.red); label('−', 96, '#fff', lb[0], lb[1] - 64)
    drops.forEach(function (d, k) {
      var x = prog(t, d, d + 0.45)
      if (x <= 0) return
      var y = rb[1] - 46 - k * 46 - (1 - easeIn(x)) * 420
      rr(rb[0] - 70, y - 21, 140, 42, 12); fill(P.green); label('+', 40, '#fff', rb[0], y)
    })
    if (bal > 0.98) label('=', 120, P.green, 450, 120)
  }
  S.diversificazione = function (t) {
    var cx = 450, cy = 440, R = 320, hole = 130, split = ease(prog(t, 0.5, 1.4))
    var parts = [0.3, 0.24, 0.2, 0.15, 0.11], cols = [P.green, P.blue, P.gold, P.purple, P.teal]
    var start = -PI / 2 + t * 0.18, pop = back(prog(t, 0, 0.5))
    parts.forEach(function (f, k) {
      var end = start + f * 2 * PI, mid = (start + end) / 2, off = 34 * split
      var ox = cx + cos(mid) * off, oy = cy + sin(mid) * off
      c.beginPath(); c.arc(ox, oy, R * pop, start, end, false); c.arc(ox, oy, hole * pop, end, start, true); c.closePath()
      fill(split < 0.02 ? P.green : cols[k]) // slice sizes are illustrative, so no percentages are printed
      start = end
    })
    label(split < 0.5 ? '1' : String(parts.length), 110, '#fff', cx, cy)
  }
  S.confronto = function (t, dur, sh) {
    var a = sh.title || 'A', b = sh.alt || 'B', low = (a + b).toLowerCase()
    var money = low.indexOf('accumul') >= 0 || low.indexOf('distribu') >= 0
    function panel(x0, dx, text, color, outflow) {
      c.save(); c.translate(dx, 0)
      rr(x0, 90, 400, 700, 40); fill(P.panel); stroke(A(color, 0.9), 6)
      rr(x0, 90, 400, 130, [40, 40, 0, 0]); fill(color)
      var mx = x0 + 200
      label(text, 54, '#fff', mx, 155, 360)
      if (money) {
        rr(mx - 110, 520, 220, 170, 26); fill(P.steelHi)
        for (var i = 0; i < 4; i++) {
          var x = frac(t * 0.8 + i / 4)
          var y = outflow ? lerp(560, 230, x) : lerp(230, 580, x)
          var px = mx + (outflow ? sin(i * 1.9) * 120 * x : sin(i * 1.9) * 40 * (1 - x))
          coin(px, y, 34, t * 6 + i, outflow ? 1 - x * 0.7 : Math.min(1, (1 - x) * 3))
        }
        rr(mx - 110, 520, 220, 30, 12); fill(A(P.steelHi, 0.9))
        label(outflow ? '→ a te' : '↺ nel fondo', 34, 'rgba(255,255,255,.8)', mx, 740, 360, 700)
      } else {
        (outflow ? [120, 180, 150, 230] : [90, 170, 240, 320]).forEach(function (h, i) {
          var hh = h * ease(prog(t, 0.6 + i * 0.12, 1.1 + i * 0.12))
          rr(x0 + 70 + i * 72, 720 - hh, 48, hh, 10); fill(color)
        })
      }
      c.restore()
    }
    panel(30, -520 * (1 - back(prog(t, 0, 0.5))), a, P.green, true)
    panel(470, 520 * (1 - back(prog(t, 0.15, 0.65))), b, P.blue, false)
    withT(450, 440, back(prog(t, 0.5, 0.9)) * (1 + 0.05 * sin(t * 5)), function () { circ(0, 0, 70); fill('#fff'); label('VS', 54, P.navy, 0, 0) })
  }
  S.domanda = function (t) {
    for (var k = 0; k < 3; k++) { var ph = frac(t * 0.6 + k / 3); ring(450, 420, 140 + 300 * ph, A(P.green, (1 - ph) * 0.45), 8) }
    glow(450, 420, 300, P.green, 0.3)
    var h = Math.abs(sin(t * 3.4)) * 130, squash = h < 25 ? 1 - 0.12 * (1 - h / 25) : 1, sh = 1 - h / 300
    ell(450, 818, 130 * sh, 18 * sh); fill('rgba(0,0,0,.35)')
    c.save(); c.translate(450, 790 - h); c.scale(2 - squash, squash); c.rotate(sin(t * 1.7) * 0.08)
    c.font = font(520, 900); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillText('?', 0, 0)
    c.restore()
  }
  S.checklist = function (t, dur) {
    var rows = 4, gap = Math.max(0.5, (dur * 0.8 - 0.4) / rows), widths = [420, 340, 460, 300]
    for (var k = 0; k < rows; k++) {
      var y = 170 + k * 160, enter = easeOut(prog(t, k * 0.1, k * 0.1 + 0.45))
      c.save(); c.translate(400 * (1 - enter), 0); c.globalAlpha *= enter
      var tk = 0.45 + k * gap, done = prog(t, tk, tk + 0.3)
      rr(110, y - 55, 110, 110, 28); fill(done > 0 ? P.green : P.panel); stroke(done > 0 ? P.green : 'rgba(255,255,255,.5)', 6)
      rr(270, y - 26, widths[k], 52, 26); fill(done > 0 ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.2)')
      if (done > 0) {
        poly([[138, y + 2], [160, y + 26], [196, y - 26]], done, '#fff', 16)
        if (done < 1) glow(165, y, 120, P.green, 0.5 * (1 - done))
      }
      c.restore()
    }
  }
  S.app = function (t, dur, sh) {
    var enter = back(prog(t, 0, 0.5))
    glow(450, 450, 420, P.green, 0.18)
    c.save(); c.translate(450, 450 + 300 * (1 - enter))
    rr(-210, -430, 420, 860, 70); fill('#070B16'); stroke('rgba(255,255,255,.3)', 6)
    rr(-192, -412, 384, 824, 54); fill(grad(P.navy2, P.navy, -192, -412, 384, 824))
    rr(-64, -400, 128, 36, 18); fill('#000')
    label('Portafoglio', 30, 'rgba(255,255,255,.6)', 0, -310, 860, 700)
    var amt = sh.number && sh.number.indexOf('%') < 0 ? amount(sh.number) : null
    if (amt != null) label(euro(amt * easeOut(prog(t, 0.3, 1.6))), 62, '#fff', 0, -245, 340)
    else { rr(-130, -268, 260 * easeOut(prog(t, 0.3, 1.2)), 44, 22); fill('rgba(255,255,255,.85)') } // no amount in the line: a placeholder bar
    if (sh.number.indexOf('%') >= 0) { rr(-70, -195, 140, 44, 22); fill(A(P.green, 0.25)); label(sh.number, 28, P.greenHi, 0, -173, 130) }
    var vals = [0.2, 0.35, 0.3, 0.5, 0.45, 0.62, 0.58, 0.8, 0.9]
    poly(vals.map(function (v, i) { return [-160 + i / 8 * 320, 70 - v * 190] }), easeOut(prog(t, 0.5, 1.8)), P.green, 8)
    ;[['Azioni', 0.6, P.green], ['Obbligazioni', 0.3, P.blue], ['Liquidità', 0.1, P.gold]].forEach(function (a, k) {
      var y = 130 + k * 82
      label(a[0], 24, 'rgba(255,255,255,.7)', -80, y - 22, 200, 600)
      rr(-160, y, 320, 22, 11); fill('rgba(255,255,255,.1)')
      rr(-160, y, 320 * a[1] * ease(prog(t, 0.9 + k * 0.2, 1.6 + k * 0.2)) + 0.1, 22, 11); fill(a[2])
    })
    for (var k = 0; k < 4; k++) { circ(-120 + k * 80, 375, 14); fill(k === 0 ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.3)') }
    c.restore()
  }
  S.protezione = function (t) {
    for (var k = 0; k < 3; k++) { var ph = frac(t * 0.7 + k / 3); ring(450, 450, 300 + 160 * ph, A(P.green, (1 - ph) * 0.35), 8) }
    for (k = 0; k < 4; k++) { // darts bouncing off
      var p = frac(t * 0.55 + k * 0.25), fromLeft = k % 2 === 0, y = 280 + k * 100
      var edge = fromLeft ? 200 : 700, start = fromLeft ? -60 : 960, dirIn = p < 0.6
      var x = dirIn ? lerp(start, edge, p / 0.6) : lerp(edge, start + (fromLeft ? 120 : -120), (p - 0.6) / 0.4)
      c.save(); c.globalAlpha *= dirIn ? 1 : 1 - (p - 0.6) / 0.4
      c.translate(x, y + (dirIn ? 0 : -(p - 0.6) * 300)); c.scale(fromLeft === dirIn ? 1 : -1, 1)
      path([[-70, 0], [0, 0]]); stroke(P.red, 10, 'round')
      path([[0, -18], [26, 0], [0, 18]], true); fill(P.red)
      c.restore()
    }
    c.save(); c.translate(450, 450); var pop = back(prog(t, 0, 0.5)); c.scale(pop, pop)
    c.beginPath(); c.moveTo(0, -300)
    c.quadraticCurveTo(120, -230, 240, -220); c.quadraticCurveTo(250, 160, 0, 320)
    c.quadraticCurveTo(-250, 160, -240, -220); c.quadraticCurveTo(-120, -230, 0, -300)
    var g = c.createLinearGradient(0, -300, 0, 320); g.addColorStop(0, P.greenHi); g.addColorStop(1, P.greenLo)
    fill(g); stroke('rgba(255,255,255,.9)', 12)
    poly([[-100, 10], [-25, 85], [110, -70]], easeOut(prog(t, 0.45, 0.95)), '#fff', 34)
    c.restore()
  }
  S.tempo = function (t, dur, sh) {
    var cx = 450, cy = 360, R = 270
    glow(cx, cy, 380, P.blue, 0.2)
    circ(cx, cy, R); fill(P.panel); ring(cx, cy, R, 'rgba(255,255,255,.85)', 14)
    for (var k = 0; k < 12; k++) {
      var a = k / 12 * 2 * PI
      path([[cx + cos(a) * (R - 50), cy + sin(a) * (R - 50)], [cx + cos(a) * (R - 22), cy + sin(a) * (R - 22)]])
      stroke(k % 3 === 0 ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.4)', k % 3 === 0 ? 12 : 7, 'round')
    }
    var spin = easeOut(prog(t, 0.2, dur)) * dur
    ;[[R * 0.5, 18, spin * 1.1 - 1.2, '#fff'], [R * 0.78, 12, spin * 9 - 1.57, P.green]].forEach(function (h) {
      path([[cx, cy], [cx + cos(h[2]) * h[0], cy + sin(h[2]) * h[0]]]); stroke(h[3], h[1], 'round')
    })
    circ(cx, cy, 20); fill(P.green)
    if (sh.years) label('Anno ' + Math.max(1, Math.round(sh.years * ease(prog(t, 0.2, Math.max(1, dur * 0.85))))), 120, '#fff', 450, 760)
    else label('Anno dopo anno', 84, '#fff', 450, 760) // no number of years in the line: none is invented
  }
  S.obiettivo = function (t, dur) {
    var cx = 520, cy = 400, pop = back(prog(t, 0, 0.45))
    ;[290, 220, 150, 80].forEach(function (r, k) { circ(cx, cy, r * pop); fill(k % 2 === 0 ? P.red : '#fff') })
    var hitAt = Math.min(0.9, dur * 0.4), fly = prog(t, 0.3, hitAt), fx = -150, fy = 900
    var dir = Math.atan2(cy - fy, cx - fx), since = t - hitAt
    if (since > 0) ring(cx, cy, 80 + since * 400, A(P.gold, Math.max(0, 1 - since * 2)), 10)
    if (fly <= 0) return
    var e = easeIn(fly) * 0.3 + fly * 0.7, wob = since > 0 ? sin(since * 35) * 0.06 * Math.exp(-since * 5) : 0
    c.save(); c.translate(lerp(fx, cx, e), lerp(fy, cy, e)); c.rotate(dir + wob)
    path([[-300, 0], [0, 0]]); stroke('#F3E9D2', 14, 'round')
    path([[10, 0], [-36, -22], [-36, 22]], true); fill(P.steelHi)
    ;[-1, 1].forEach(function (s) { path([[-300, 0], [-340, 34 * s], [-260, 34 * s], [-230, 0]], true); fill(P.green) })
    c.restore()
  }
  S.errore = function (t) {
    for (var k = 0; k < 2; k++) { var ph = frac(t * 0.8 + k / 2); ring(450, 450, 260 + 200 * ph, A(P.red, (1 - ph) * 0.4), 10) }
    glow(450, 450, 380, P.red, 0.3)
    var shake = sin(t * 42) * 16 * Math.exp(-t * 2.2) + sin(t * 40) * 8 * Math.max(0, 1 - frac(t / 2.2) * 6)
    c.save(); c.translate(450 + shake, 450); var pop = back(prog(t, 0, 0.4)); c.scale(pop, pop)
    path([[0, -290], [310, 250], [-310, 250]], true); fill(P.red); stroke(P.red, 60, 'butt', 'round'); stroke('rgba(255,255,255,.9)', 10, 'butt', 'round')
    rr(-24, -150, 48, 240, 24); fill('#fff'); circ(0, 160, 30); fill('#fff')
    c.restore()
  }
  S.cta = function (t, dur, sh) {
    var pop = back(prog(t, 0, 0.55))
    glow(450, 300, 380, P.green, 0.3)
    withT(450, 290, pop, function () {
      rr(-170, -156, 340, 340, 80); fill('rgba(0,0,0,.35)')
      if (BRAND.logo) { c.save(); rr(-170, -170, 340, 340, 80); c.clip(); c.drawImage(BRAND.logo, -170, -170, 340, 340); c.restore() }
      else { rr(-170, -170, 340, 340, 80); fill(grad(P.greenHi, P.greenLo, -170, -170, 340, 340)); label((BRAND.name || '★').charAt(0).toUpperCase(), 200, '#fff', 0, 10, 300, 900) }
      rr(-170, -170, 340, 340, 80); stroke('rgba(255,255,255,.25)', 4)
    })
    var b = back(prog(t, 0.35, 0.8)), ph = frac(t * 0.9)
    withT(450, 640, b * (1 + 0.04 * sin(t * 6)), function () {
      if (b > 0.9) { rr(-290 - 40 * ph, -72 - 40 * ph, 580 + 80 * ph, 144 + 80 * ph, 72 + 40 * ph); stroke(A(P.green, 1 - ph), 8) }
      rr(-290, -72, 580, 144, 72); fill(P.green)
      label(sh.title || ('Prova ' + (BRAND.name || 'l’app')), 54, '#fff', 0, 0, 520)
    })
    label(sh.alt || 'Link in bio', 40, A('#ffffff', 0.8 * clamp01(b)), 450, 790, 860, 700)
  }

  /* ---------- plan: timing of every line ---------- */
  var logos = {}
  function plan(data) {
    data = data || {}
    var brand = data.brand || {}
    var beats = (data.beats || []).map(function (b, i) { return { b: b || {}, src: i } }).filter(function (x) { return String(x.b.text || '').trim() })
    var shots = [], t = 0, prev = null, n = beats.length
    beats.forEach(function (x, i) {
      var b = x.b, text = String(b.text).trim(), low = text.toLowerCase()
      var label = b.label != null ? String(b.label) : n > 1 && i === 0 ? 'hook' : n > 1 && i === n - 1 ? 'cta' : ''
      var auto = guess(text, label, prev), scene = META[b.scene] ? b.scene : auto
      var ws = text.split(/\s+/), speak = ws.length / WPS
      var dur = Math.max(2.2, speak + 0.55) + (i === n - 1 ? TAIL : 0)
      // words get time in proportion to their length: long words take longer to say
      var wsum = ws.reduce(function (s, w) { return s + w.length + 2 }, 0), acc = 0
      var words = ws.map(function (w) { var s = LEAD + acc / wsum * speak; acc += w.length + 2; return { text: w, start: s } })
      var title = b.title ? String(b.title) : META[scene][1], alt = b.alt ? String(b.alt) : ''
      if (scene === 'confronto' && !b.title && !b.alt && low.indexOf('distribuzion') >= 0 && low.indexOf('accumul') >= 0) { title = 'Distribuzione'; alt = 'Accumulo' }
      var dm = low.match(/\b([1-9]|[12]\d|3[01])\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)/)
      var ym = low.match(/\b(\d{1,2})\s+anni\b/)
      shots.push({
        src: x.src, text: text, label: label, scene: scene, auto: auto, start: t, dur: dur,
        title: title, alt: alt, number: b.number != null ? String(b.number) : numberIn(text),
        day: dm ? +dm[1] : 0, years: ym && +ym[1] >= 1 && +ym[1] <= 60 ? +ym[1] : 0,
        words: words, pages: pages(ws),
      })
      t += dur; prev = scene
    })
    var logo = null
    if (brand.logo && typeof Image !== 'undefined') {
      logo = logos[brand.logo]
      if (!logo) { logo = logos[brand.logo] = new Image(); logo.src = brand.logo }
    }
    return { total: t, shots: shots, pal: palette(brand.colors), name: String(brand.name || ''), logo: logo }
  }
  function locate(pl, t) {
    var i = 0
    for (var k = 0; k < pl.shots.length; k++) if (pl.shots[k].start <= t) i = k
    var s = pl.shots[i]
    return [i, s ? Math.min(Math.max(0, t - s.start), s.dur) : 0]
  }

  /* ---------- one frame ---------- */
  function background(t) {
    var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, P.navy); g.addColorStop(0.5, P.navy2); g.addColorStop(1, P.navy)
    c.fillStyle = g; c.fillRect(0, 0, W, H)
    glow(540 + 320 + 90 * sin(t * 0.3), 960 - 560 + 70 * cos(t * 0.25), 620, P.green, 0.24)
    glow(540 - 360 + 80 * cos(t * 0.21), 960 + 620 + 60 * sin(t * 0.27), 560, P.blue, 0.2)
  }
  function header(pl, t, i, x) {
    rr(70, 70, 940, 10, 5); fill('rgba(255,255,255,.16)')
    var p = clamp01(pl.total > 0 ? t / pl.total : 0)
    if (p > 0) { rr(70, 70, 940 * p, 10, 5); fill(P.green) }
    var tx = 70, lab = pl.shots[i] ? pl.shots[i].label.toUpperCase() : ''
    if (BRAND.logo) {
      c.save(); rr(70, 114, 112, 112, 28); c.clip(); c.drawImage(BRAND.logo, 70, 114, 112, 112); c.restore()
      rr(70, 114, 112, 112, 28); stroke('rgba(255,255,255,.2)', 2)
      tx = 206
    }
    c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.font = font(42)
    c.fillText(BRAND.name, tx, lab ? 145 : 170, 1010 - tx)
    if (lab) {
      c.save(); c.globalAlpha *= x
      c.font = font(26); if ('letterSpacing' in c) c.letterSpacing = '3px'
      var w = c.measureText(lab).width
      rr(tx, 178, w + 36, 44, 22); fill(A(P.green, 0.18)); stroke(A(P.green, 0.6), 2)
      c.fillStyle = P.greenHi; c.fillText(lab, tx + 18, 201)
      c.restore()
    }
  }
  function scene(pl, i, lt, alpha, scale, dy) {
    var s = pl.shots[i]
    c.save(); c.globalAlpha *= clamp01(alpha)
    c.translate(540, 755 + dy); c.scale(scale, scale); c.translate(-540, -755)
    var heading = s.scene === 'confronto' || s.scene === 'cta' ? '' : s.title
    if (heading) label(heading, 68, '#fff', 540, 298, 940)
    c.translate(90, 358); c.beginPath(); c.rect(0, 0, 900, 900); c.clip()
    try { S[s.scene](lt, Math.max(s.dur, 1), s) } finally { c.restore() }
  }
  function captions(pl, i, lt, alpha) {
    var s = pl.shots[i], ws = s.words, cur = -1
    for (var k = 0; k < ws.length; k++) if (ws[k].start <= lt) cur = k
    var pg = s.pages.filter(function (r) { return Math.max(cur, 0) >= r[0] && Math.max(cur, 0) < r[1] })[0] || s.pages[0]
    if (!pg || alpha <= 0) return
    var words = ws.slice(pg[0], pg[1]), size = 78, maxW = 784, lines, sp
    for (;;) { // wrap, then shrink until it fits in three lines
      c.font = font(size); sp = c.measureText(' ').width; lines = [[]]
      var lw = 0, widest = 0
      words.forEach(function (w) {
        var ww = c.measureText(w.text).width
        if (lines[lines.length - 1].length && lw + sp + ww > maxW) { lines.push([]); lw = 0 }
        lw += (lines[lines.length - 1].length ? sp : 0) + ww; lines[lines.length - 1].push(ww)
        widest = Math.max(widest, lw)
      })
      if ((lines.length <= 3 && widest <= maxW) || size < 48) break
      size *= 0.92
    }
    var lh = size * 1.14, widths = lines.map(function (l) { return l.reduce(function (a, b) { return a + b }, 0) + sp * (l.length - 1) })
    var bw = Math.max.apply(null, widths) + 76, bh = lines.length * lh + 48, cx = 500, cy = 1425
    c.save(); c.globalAlpha *= clamp01(alpha)
    rr(cx - bw / 2, cy - bh / 2, bw, bh, 44); fill('rgba(0,0,0,.45)')
    c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 12; c.shadowOffsetY = 3
    c.textAlign = 'left'; c.textBaseline = 'middle'
    var n = pg[0]
    lines.forEach(function (l, li) {
      var x = cx - widths[li] / 2, y = cy - bh / 2 + 24 + lh * (li + 0.5)
      l.forEach(function (ww) {
        c.fillStyle = n === cur ? P.greenHi : cur >= 0 && n < cur ? '#fff' : 'rgba(255,255,255,.62)'
        c.fillText(ws[n].text, x, y); x += ww + sp; n++
      })
    })
    c.restore()
  }
  /** Draws the frame at time t. The canvas may be any 9:16 size: the drawing is scaled to it. */
  function draw(ctx, pl, t) {
    c = ctx; P = pl.pal; BRAND = { name: pl.name, logo: pl.logo && pl.logo.complete && pl.logo.naturalWidth ? pl.logo : null }
    c.save(); c.scale(ctx.canvas.width / W, ctx.canvas.height / H)
    try {
      background(t)
      var loc = locate(pl, t), i = loc[0], lt = loc[1]
      // the old line leaves quickly, the new one arrives a beat later: no double image when two scenes look alike
      var x = i > 0 ? ease(prog(lt, 0.12, 0.45)) : 1, out = i > 0 ? ease(prog(lt, 0, 0.22)) : 1
      header(pl, t, i, x)
      if (!pl.shots.length) return
      var p = pl.shots[i - 1]
      if (out < 1) scene(pl, i - 1, p.dur + lt, 1 - out, 1 + 0.06 * out, -50 * out)
      // the first scene starts already in: frame 0 is the cover the apps show in the grid
      scene(pl, i, lt + (i === 0 ? 0.7 : 0), x, 0.94 + 0.06 * x, 60 * (1 - x))
      if (out < 1) captions(pl, i - 1, p.dur + lt, 1 - out)
      captions(pl, i, lt, x)
    } finally { c.restore() }
  }

  /** Assertions ported from ReelTimeline.selfCheck; throws on the first failure. */
  function selfCheck() {
    var ok = function (v, m) { if (!v) throw new Error('ReelPlayer selfCheck: ' + m) }
    ok(JSON.stringify(pages(['ETF', 'a', 'distribuzione', 'o', 'ad', 'accumulo?', 'La', 'differenza', 'conta.'])) === '[[0,6],[6,9]]', 'pages')
    ok(guess('ETF a distribuzione o ad accumulo?', 'hook') === 'confronto', 'confronto')
    ok(guess('Un ETF a distribuzione ti paga i dividendi', '') === 'distribuzione', 'distribuzione')
    ok(guess('Un ETF ad accumulo reinveste i dividendi', '') === 'accumulo', 'accumulo')
    ok(guess('Prova Yourvest', 'cta') === 'cta', 'cta')
    var two = plan({ beats: [{ text: 'Un ETF ad accumulo reinveste', label: '' }, { text: '300 euro da incassare o reinvestire', label: '' }] }).shots
    ok(two[0].scene === 'accumulo' && two[1].scene === 'distribuzione', 'never twice in a row: ' + two.map(function (s) { return s.scene }))
    ok(numberIn('con 10.000 euro all’anno') === '€ 10.000', 'euro') ; ok(numberIn('il 3% di dividendi') === '3%', 'pct')
    ok(numberIn('ne ricevi 300 euro, ogni anno') === '€ 300', 'trailing comma') ; ok(numberIn('senza cifre') === '', 'none')
    ok(amount('€ 10.000') === 10000, 'amount')
    var p = plan({ beats: [{ text: 'uno' }, { text: '' }, { text: 'due tre' }] })
    ok(p.shots.length === 2 && p.shots[1].src === 2 && p.shots[0].dur === 2.2 && p.total === 2.2 + 2.2 + TAIL, 'timing')
    ok(locate(p, 2.3)[0] === 1, 'locate')
    return true
  }

  var api = { W: W, H: H, scenes: IDS.map(function (id) { return { id: id, name: META[id][0] } }), plan: plan, draw: draw, guess: guess, guesses: guesses, numberIn: numberIn, selfCheck: selfCheck }
  if (typeof window !== 'undefined') window.ReelPlayer = api
  if (typeof module !== 'undefined') module.exports = api
})()
