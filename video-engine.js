/* Video engine: turns a VIDEO_CONFIG (the JSON the AI writes, see docs/video-engine/SPEC.md) into motion graphics on a canvas.
   Every video of the Studio goes through here: 4 acts (hook, body by `mode`, freeze + provocation, CTA), formats 9:16 / 16:9 / 1:1.
   Self-contained on purpose: the same file runs the web preview, the MP4 recording, the downloadable HTML and the iOS app
   (off-screen WKWebView), so no imports, no web fonts, no DOM besides the canvas it is given. Every frame is a pure function of t.
   The explainer scenes below are the 18 scenes of the old reel player (ported from native/Studio/Video). */
(function () {
  'use strict'
  var PI = Math.PI
  var FONT = 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

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
      [has(['interesse composto', 'compost', 'palla di neve', 'altri interessi', 'interessi sugli']), 'interesse'],
      [has(['diversific', 'paniere', 'allocazion', 'settori']), 'diversificazione'],
      [has(['errore', 'errori', 'sbagli', 'attenzione', 'evita']), 'errore'],
      [has(['proteg', 'scudo', 'al sicuro', 'rischio']), 'protezione'],
      [has(['obiettiv', 'traguard', 'pension', 'meta ']), 'obiettivo'],
      [has(['crollo', 'crolla', 'scende', 'ribass', 'calo', 'perdit']), 'calo'],
      [has(['cresc', 'sale ', 'salire', 'rendiment', 'guadagn']), 'crescita'],
      [has([' anni', ' anno', 'l’anno', "l'anno", 'tempo', 'lungo periodo', 'pazienza']), 'tempo'],
      [has([' app', 'portafoglio', 'yourvest', 'telefono']), 'app'],
      [has(['passi', 'regole', 'prima di', 'controlla']), 'checklist'],
      [l.indexOf('hook') >= 0, 'domanda'], // a "?" only as the opening hook: every other line shows its answer
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
  /* the owner's preset (template-originale.html), kept verbatim: it is the reference for mode race */
  var RACE_SAMPLE = {
    sector: "FINANZA • 10Y BATTLE",
    brand: {
      name: "NEXUS INVEST",
      qrSeed: "nexus-invest-app-2026",
      bonusText: "✓ Bonus Benvenuto: 30 giorni PRO inclusi"
    },
    timing: {
      totalDurationSec: 46,
      chartEndP: 0.72,
      freezeEndP: 0.76,
      provEndP: 0.87
    },
    headerSubtitle: "Apple (AAPL) vs Microsoft (MSFT) • Rendimento % 2016–2026",
    chartWatermark: "DATI STORICI SPLIT-ADJUSTED • RENDIMENTO CUMULATO %",
    intro: {
      tag: "NEXUS INVEST • DATA STORY",
      title: "APPLE vs MICROSOFT",
      subtitle: "10 ANNI IN 40 SECONDI",
      description: "€10.000 investiti nel 2016. Due giganti, sorpassi clamorosi e oltre €43.000 di differenza al traguardo del 2026.",
      playLabel: "GUARDA LO SPOT"
    },
    series: {
      a: { name: "APPLE", ticker: "AAPL", color: "#38BDF8", subLabel: "Ecosistema & Silicon" },
      b: { name: "MICROSOFT", ticker: "MSFT", color: "#10B981", subLabel: "Cloud Azure & AI" }
    },
    unit: {
      prefix: "+",
      negativePrefix: "-",
      suffix: "%",
      spreadSuffix: " pp",
      decimals: 1,
      higherIsBetter: true,
      baselineValue: 0
    },
    data: [
      { label: "Nov 16", fullDate: "Novembre 2016", a: 0.0, b: 0.0 },
      { label: "Mag 17", fullDate: "Maggio 2017", a: 39.6, b: 13.0 },
      { label: "Gen 18", fullDate: "Gennaio 2018", a: 58.4, b: 48.0 },
      { label: "Set 18", fullDate: "Settembre 2018", a: 98.0, b: 78.8 },
      { label: "Mag 19", fullDate: "Maggio 2019", a: 76.4, b: 110.0 },
      { label: "Gen 20", fullDate: "Gennaio 2020", a: 177.6, b: 166.5 },
      { label: "Apr 20", fullDate: "Aprile 2020", a: 115.9, b: 154.1 },
      { label: "Nov 20", fullDate: "Novembre 2020", a: 317.1, b: 255.6 },
      { label: "Ott 21", fullDate: "Ottobre 2021", a: 432.0, b: 410.8 },
      { label: "Giu 22", fullDate: "Giugno 2022", a: 406.8, b: 342.3 },
      { label: "Dic 22", fullDate: "Dicembre 2022", a: 428.8, b: 321.3 },
      { label: "Ago 23", fullDate: "Agosto 2023", a: 551.1, b: 441.5 },
      { label: "Giu 24", fullDate: "Giugno 2024", a: 642.4, b: 643.1 },
      { label: "Feb 25", fullDate: "Febbraio 2025", a: 778.5, b: 574.4 },
      { label: "Ago 25", fullDate: "Agosto 2025", a: 624.1, b: 765.9 },
      { label: "Apr 26", fullDate: "Aprile 2026", a: 815.6, b: 517.0 },
      { label: "Nov 26", fullDate: "Novembre 2026", a: 1153.8, b: 714.7 }
    ],
    milestones: [
      { idx: 3,  label: "2018 • Trillion Club", target: "a", dir: "top",    color: "#38BDF8" },
      { idx: 7,  label: "2020 • Chip M1",       target: "a", dir: "top",    color: "#38BDF8" },
      { idx: 10, label: "2022 • Bear Market",   target: "b", dir: "bottom", color: "#F59E0B" },
      { idx: 12, label: "2024 • Aggancio AI",   target: "b", dir: "top",    color: "#10B981" },
      { idx: 14, label: "2025 • Sorpasso MSFT!",target: "b", dir: "top",    color: "#10B981" },
      { idx: 16, label: "2026 • Apple > $5T",   target: "a", dir: "top",    color: "#38BDF8" }
    ],
    chapters: [
      {
        id: 1, startIdx: 0, endIdx: 4, accent: "a",
        pill: "2016–2019 • PARTENZA",
        title: "Due colossi, un solo traguardo: il club del Trilione.",
        html: `Apple e Microsoft partono alla pari nel 2016. I ricavi ricorrenti di <span class="hl-a">iPhone</span> e la svolta cloud <span class="hl-b">Azure</span> accendono la sfida del decennio.`,
        speech: "Novembre 2016. Apple e Microsoft partono alla pari verso il club del trilione."
      },
      {
        id: 2, startIdx: 5, endIdx: 10, accent: "a",
        pill: "2020–2022 • SVOLTA & SHOCK",
        title: "Boom pandemico e test di resistenza dei tassi Fed.",
        html: `Con i chip <span class="hl-a">Apple Silicon M1</span> Apple vola oltre <span class="hl-a">+317%</span>. Anche nel Bear Market del 2022 il vantaggio accumulato resta enorme.`,
        speech: "Nel 2020 Apple accelera con i chip M1. Nel 2022 i tassi Fed mettono alla prova i mercati, ma il vantaggio di lungo periodo regge."
      },
      {
        id: 3, startIdx: 11, endIdx: 14, accent: "b",
        pill: "2023–2025 • SORPASSO AI",
        title: "L'alleanza OpenAI lancia Microsoft al sorpasso!",
        html: `Copilot e i data center AI azzerano il divario nel 2024 e portano <span class="hl-b">Microsoft in testa (+765,9%)</span> nell'agosto 2025.`,
        speech: "Con l'intelligenza artificiale e Copilot, Microsoft aggancia Apple e piazza il clamoroso sorpasso nell'estate 2025."
      },
      {
        id: 4, startIdx: 15, endIdx: 16, accent: "a",
        pill: "2026 • GRAN FINALE",
        title: "Lo sprint leggendario: Apple sfonda +1.153%.",
        html: `Ribaltone finale: <span class="hl-a">Apple chiude a +1.153,8%</span> contro il <span class="hl-b">+714,7%</span> di Microsoft. Uno spread netto di <span class="hl-gold">+439,2 punti</span>!`,
        speech: "Nel 2026 arriva lo sprint leggendario di Apple, che chiude a più millecentocinquantatré per cento."
      }
    ],
    provocation: {
      line1: `Guardare chi ha vinto negli ultimi 10 anni è <span class="text-white underline decoration-sky-400/70 decoration-4 underline-offset-4">facile</span>.`,
      line2: `Ma quanti <span class="hl-a">“nuovi Apple”</span> o <span class="hl-b">“nuovi Microsoft”</span> ti stai perdendo <span class="inline-block px-2.5 py-0.5 rounded-lg bg-amber-400/15 border border-amber-300/45 text-amber-300">PROPRIO OGGI</span> perché investi ancora a intuito?`,
      speech: "Guardare chi ha vinto negli ultimi 10 anni è facile. Ma quanti nuovi Apple o nuovi Microsoft ti stai perdendo proprio oggi perché investi ancora a intuito?"
    },
    cta: {
      badge: "Smetti di indovinare. Inizia a vedere i dati.",
      subtitle: "Scarica l'app gratuita e porta l'analisi istituzionale nel palmo della tua mano:",
      features: [
        { title: "Confronti storici & AI Forecast", desc: "Compara qualsiasi titolo e visualizza scenari predittivi in 1 click." },
        { title: "Alert istantanei in tempo reale", desc: "Notifiche immediate su sorpassi, trimestrali e breakout chiave." },
        { title: "Oltre 10.000 azioni ed ETF", desc: "Bilanci, multipli, dividendi e rating analisti sempre aggiornati." },
        { title: "Simulatore di Portafoglio", desc: "Backtesta strategie PAC e allocazioni prima di investire €1." }
      ],
      speech: "Smetti di indovinare, inizia a vedere i dati. Scarica gratis Nexus Invest su App Store e Google Play."
    }
  }

  /* =====================================================================================================
     VIDEO ENGINE (VIDEO_CONFIG v2)
     ===================================================================================================== */
  var FD = '"SF Pro Display", "Helvetica Neue", "Segoe UI", Roboto, system-ui, -apple-system, sans-serif'
  var FM = 'ui-monospace, "SF Mono", Menlo, Consolas, "Roboto Mono", monospace'
  var BG = '#050811', WPS2 = 2.7, FREEZE = 1.6
  var FORMATS = { '9:16': { W: 1080, H: 1920, u: 2.1 }, '16:9': { W: 1920, H: 1080, u: 1.4 }, '1:1': { W: 1080, H: 1080, u: 1.6 } }
  var MODES = ['race', 'growth', 'ranking', 'explainer', 'list', 'stat', 'news']
  var DATA = { race: 1, growth: 1 }
  var MODE_NAME = { race: 'Gara A contro B', growth: 'Crescita nel tempo', ranking: 'Classifica', explainer: 'Spiegazione a scene', list: 'Lista di passi', stat: 'Numeri chiave', news: 'Notizia' }
  var MODE_TAG = { race: 'DATA STORY', growth: 'DATA STORY', ranking: 'CLASSIFICA', explainer: 'SPIEGONE', list: 'CHECKLIST', stat: 'I NUMERI', news: 'ULTIM’ORA' }
  var COUNTER = { race: 'FASE', growth: 'FASE', ranking: 'PARTE', explainer: 'PARTE', list: 'PASSO', stat: 'DATO', news: 'FATTO' }
  var DISCLAIMER = 'Esempio ipotetico a scopo illustrativo. Non è consulenza finanziaria.'
  var FEATURES_YV = [
    { title: 'Tutto in un posto', desc: 'Azioni, ETF, crypto e liquidità da ogni broker.' },
    { title: 'Fisco italiano già fatto', desc: 'Zainetto fiscale con le scadenze delle minusvalenze.' },
    { title: 'Prospetto per il 730', desc: 'I numeri pronti per la dichiarazione.' },
    { title: 'Previdenza e TFR', desc: 'Fondi pensione e TFR nello stesso quadro.' }]
  var FEATURES_GEN = [
    { title: 'Semplice', desc: 'Tutto chiaro in pochi tocchi.' },
    { title: 'Sempre aggiornato', desc: 'I dati che ti servono, quando servono.' },
    { title: 'Su misura', desc: 'Pensato per come lavori tu.' },
    { title: 'Inizia oggi', desc: 'Pochi minuti per partire.' }]

  /* ---------- small helpers ---------- */
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {} }
  function arr(v) { return Array.isArray(v) ? v : [] }
  function cut(s, max) {
    if (s.length <= max) return s
    var k = s.lastIndexOf(' ', max - 1)
    return s.slice(0, k > max * 0.6 ? k : max - 1).replace(/[\s,.;:–-]+$/, '') + '…'
  }
  /** Any value to a clean one-line string of at most max characters ('' for objects, null…). */
  function str(v, max) {
    var s = typeof v === 'string' ? v : typeof v === 'number' && isFinite(v) ? String(v) : ''
    s = s.replace(/\s+/g, ' ').trim()
    return max ? cut(s, max) : s
  }
  function raw(v, max) { return (typeof v === 'string' ? v : typeof v === 'number' && isFinite(v) ? String(v) : '').replace(/[\r\n]/g, '').slice(0, max) }
  /** Number from a number or an Italian/English numeric string ("1.153,8", "12.5"); d when there is none. */
  function num(v, d) {
    if (typeof v === 'number') return isFinite(v) ? v : d
    var s = String(v == null ? '' : v).replace(/[^\d,.-]/g, '')
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.')
    var n = parseFloat(s)
    return isFinite(n) ? n : d
  }
  function clampN(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }
  function words(s) { s = String(s || '').trim(); return s ? s.split(/\s+/).length : 0 }
  function hexOr(v, d) { return toHex(hex(v) || hex(d)) }
  function bright(col) { return lum(col) < 0.3 ? mix(col, '#ffffff', 0.45) : col } // a dark brand colour would vanish on #050811
  function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return '&#' + ch.charCodeAt(0) + ';' }) }
  var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  function decode(s) {
    return String(s).replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, function (m, e) {
      e = e.toLowerCase()
      if (e.charAt(0) === '#') { var n = e.charAt(1) === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '' }
      return ENT[e] != null ? ENT[e] : m
    })
  }

  /* ---------- rich text: the hl-a / hl-b / hl-gold spans of the config, as coloured words ---------- */
  function tokOf(st, t, gap) { return { t: t, col: st.col || '', chip: st.chip ? 1 : 0, und: st.und ? 1 : 0, bold: st.bold ? 1 : 0, gap: !!gap } }
  /** html → words {t, col ('' | a | b | gold | w), chip, und, bold, gap (space before)}. Every other tag is dropped. */
  function rich(html) {
    var out = [], stack = [{}], re = /<\s*(\/?)\s*([a-z0-9]+)([^>]*)>|([^<]+)/gi, m, gap = true, src = String(html == null ? '' : html)
    while ((m = re.exec(src))) {
      var top = stack[stack.length - 1]
      if (m[4] != null) {
        var txt = decode(m[4])
        if (top.chip) { // a chip ("OGGI" in a box) never breaks
          var one = txt.replace(/\s+/g, ' ').trim()
          if (one) { out.push(tokOf(top, one, gap || /^\s/.test(txt))); gap = /\s$/.test(txt) }
          continue
        }
        txt.split(/(\s+)/).forEach(function (p) {
          if (!p) return
          if (/^\s+$/.test(p)) { gap = true; return }
          out.push(tokOf(top, p, gap)); gap = false
        })
        continue
      }
      var tag = m[2].toLowerCase()
      if (tag === 'br') { out.push({ t: '', br: 1 }); gap = true; continue }
      if (tag !== 'span' && tag !== 'b' && tag !== 'strong') continue
      if (m[1]) { if (stack.length > 1) stack.pop(); continue }
      if (/\/\s*$/.test(m[3])) continue
      var cls = (m[3].match(/class\s*=\s*["']([^"']*)["']/i) || [])[1] || ''
      var st = { col: top.col, chip: top.chip, und: top.und, bold: top.bold || tag !== 'span' }
      if (/\bhl-a\b/.test(cls)) { st.col = 'a'; st.bold = 1 } else if (/\bhl-b\b/.test(cls)) { st.col = 'b'; st.bold = 1 } else if (/\bhl-gold\b/.test(cls)) { st.col = 'gold'; st.bold = 1 } else if (/text-white/.test(cls)) st.col = 'w'
      if (/inline-block|amber|\bchip\b/.test(cls)) { st.chip = 1; st.col = 'gold'; st.bold = 1 }
      if (/underline/.test(cls)) st.und = 1
      stack.push(st)
    }
    return out
  }
  function plain(html) { return rich(html).map(function (w, i) { return (i && w.gap ? ' ' : '') + w.t }).join('').replace(/\s+/g, ' ').trim() }
  // the brand is written Yourv€$t but must be spoken "Yourvest" (every voice reads the plan's speech: app, site, HTML)
  function say(s) { return String(s).replace(/your\s*v[€e]\s*[$s]\s*t/gi, 'Yourvest') }
  /** Shortens rich text to about max visible characters, keeping its highlights. */
  function cutRich(html, max) {
    var s = String(html == null ? '' : html), ws = rich(s), n = 0, keep = []
    if (ws.reduce(function (a, w) { return a + w.t.length + 1 }, 0) <= max + 3) return s // +3: room for the … so a second pass changes nothing
    for (var i = 0; i < ws.length; i++) { n += ws[i].t.length + 1; if (n > max + 1) break; keep.push(ws[i]) }
    return keep.map(function (w, j) {
      var cls = w.chip ? 'chip' : w.col === 'w' ? 'text-white' : w.col ? 'hl-' + w.col : '', x = esc(w.t)
      return (j && w.gap ? ' ' : '') + (cls ? '<span class="' + cls + '">' + x + '</span>' : x)
    }).join('').replace(/[\s,.;:]+$/, '') + '…'
  }
  /** Text for the voice: no tags, no symbols. */
  function spoken(v, max) {
    var s = plain(typeof v === 'string' ? v : '').replace(/(\d)\s?%/g, '$1 per cento').replace(/€\s?/g, ' euro ').replace(/[#*_~^|<>]/g, ' ')
    return str(s, max)
  }
  function toks(text) { return String(text || '').split(/\s+/).filter(Boolean).map(function (t) { return { t: t, col: '', gap: true } }) }

  /* ---------- validate: any AI JSON → a config that can always be drawn ---------- */
  function slugOf(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'video' }
  function validate(input) {
    var c0 = input
    if (typeof c0 === 'string') { try { c0 = JSON.parse(c0) } catch (e) { c0 = {} } }
    c0 = obj(c0)
    var format = FORMATS[c0.format] ? c0.format : '9:16'
    var data0 = arr(c0.data).filter(function (d) { return d && typeof d === 'object' }).slice(0, 40)
    var items0 = arr(c0.items).filter(function (d) { return d && typeof d === 'object' }).slice(0, 8)
    var hasB = data0.some(function (d) { return isFinite(num(d.b, NaN)) })
    var mode = MODES.indexOf(c0.mode) >= 0 ? c0.mode : data0.length >= 2 ? (hasB ? 'race' : 'growth') : items0.length >= 2 ? 'ranking' : 'explainer'
    if (mode === 'race' && !hasB) mode = 'growth'
    if (DATA[mode] && data0.length < 2) mode = 'explainer'
    if (mode === 'ranking' && items0.length < 2) mode = 'explainer'

    var b0 = obj(c0.brand), name = str(b0.name, 28) || 'Yourv€$t'
    var s0 = obj(c0.series), sa = obj(s0.a), sb = obj(s0.b), pal0 = obj(c0.palette)
    var colA = bright(hexOr(sa.color, hexOr(pal0.a, '#38BDF8'))), colB = bright(hexOr(sb.color, hexOr(pal0.b, '#10B981'))), gold = bright(hexOr(pal0.gold, '#FBBF24'))
    if (colA === colB) colB = colA === '#10b981' ? '#38bdf8' : '#10b981'
    var palette = { a: colA, b: colB, gold: gold }

    var i0 = obj(c0.intro)
    var intro = {
      tag: str(i0.tag, 34).toUpperCase() || name.toUpperCase() + ' • ' + MODE_TAG[mode],
      title: str(i0.title, 48) || str(c0.headerSubtitle, 48) || name,
      subtitle: str(i0.subtitle, 44), description: str(i0.description, 170),
      playLabel: str(i0.playLabel, 22).toUpperCase() || 'GUARDA ORA', speech: spoken(i0.speech, 220),
    }

    var out = { version: 2, format: format, mode: mode, sector: str(c0.sector, 36).toUpperCase(), brand: { name: name, qrSeed: str(b0.qrSeed, 60) || slugOf(name), bonusText: str(b0.bonusText, 70) } }
    out.headerSubtitle = str(c0.headerSubtitle, 90)
    out.chartWatermark = str(c0.chartWatermark, 48).toUpperCase()
    out.palette = palette
    out.intro = intro

    var n = 0
    if (DATA[mode] || mode === 'ranking') {
      var u0 = obj(c0.unit)
      out.unit = {
        prefix: raw(u0.prefix, 4), negativePrefix: u0.negativePrefix == null ? '-' : raw(u0.negativePrefix, 5), suffix: raw(u0.suffix, 6),
        spreadSuffix: u0.spreadSuffix == null ? raw(u0.suffix, 6) : raw(u0.spreadSuffix, 6),
        decimals: clampN(Math.round(num(u0.decimals, 1)), 0, 3), higherIsBetter: u0.higherIsBetter !== false, baselineValue: num(u0.baselineValue, 0),
      }
    }
    if (DATA[mode]) {
      var ser = function (s, d, col) {
        var nm = str(s.name, 22) || 'Serie ' + d
        return { name: nm, ticker: str(s.ticker, 8).toUpperCase() || nm.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || d, color: col, subLabel: str(s.subLabel, 40) }
      }
      out.series = mode === 'race' ? { a: ser(sa, 'A', colA), b: ser(sb, 'B', colB) } : { a: ser(sa, 'A', colA) }
      var pa = 0, pb = 0 // a missing value repeats the previous one
      out.data = data0.map(function (d, i) {
        var a = num(d.a, pa), b = num(d.b, pb), label = str(d.label, 10) || String(i + 1)
        pa = a; pb = b
        var p = { label: label, fullDate: str(d.fullDate, 28) || label, a: a }
        if (mode === 'race') p.b = b
        return p
      })
      n = out.data.length
      out.milestones = arr(c0.milestones).slice(0, 8).map(function (m) {
        m = obj(m)
        var tg = m.target === 'b' && mode === 'race' ? 'b' : 'a'
        return { idx: clampN(Math.round(num(m.idx, 0)), 0, n - 1), label: str(m.label, 24), target: tg, dir: m.dir === 'bottom' ? 'bottom' : 'top', color: bright(hexOr(m.color, tg === 'b' ? colB : colA)) }
      }).filter(function (m) { return m.label })
    }
    if (mode === 'ranking') out.items = items0.map(function (it, i) { return { name: str(it.name, 24) || 'Voce ' + (i + 1), value: num(it.value, 0), color: it.color ? bright(hexOr(it.color, colA)) : '' } })

    /* chapters */
    var prev = null
    var chapters = arr(c0.chapters).filter(function (ch) { return ch && typeof ch === 'object' }).slice(0, 8).map(function (ch, i) {
      var html = cutRich(ch.html != null ? String(ch.html) : esc(str(ch.text) || str(ch.caption)), 210)
      var title = str(ch.title, 70), q = str(ch.q, 90)
      var o = {
        id: i + 1, pill: str(ch.pill, 30).toUpperCase(), title: title, html: html,
        speech: spoken(ch.speech, 340) || spoken((q ? q + ' ' : '') + (title ? title + ' ' : '') + plain(html), 340),
        accent: ch.accent === 'a' || ch.accent === 'b' || ch.accent === 'gold' ? ch.accent : i % 2 ? 'b' : 'a',
      }
      if (q) o.q = q
      var big = str(ch.big, 14), caption = str(ch.caption, 80), answer = title + ' ' + plain(html)
      if (!big && mode === 'explainer') big = numberIn(answer) // the answer's figure, big, beside its scene
      if (big) o.big = big
      if (caption) o.caption = caption
      // the "?" scene only opens the video: a later chapter answers, so its scene comes from the answer
      if (mode === 'explainer') { o.scene = META[ch.scene] && !(i && ch.scene === 'domanda') ? ch.scene : guess(answer, i ? '' : 'hook', prev); prev = o.scene }
      if (DATA[mode]) { o.startIdx = Math.round(num(ch.startIdx, NaN)); o.endIdx = Math.round(num(ch.endIdx, NaN)) }
      return o
    })
    if (!chapters.length) { // the AI forgot them: build neutral ones so the body still plays
      if (DATA[mode]) {
        var k = Math.min(3, n - 1)
        for (var j = 0; j < k; j++) chapters.push({ id: j + 1, pill: '', title: '', html: '', speech: '', accent: j % 2 ? 'b' : 'a', startIdx: Math.round(j * (n - 1) / k), endIdx: NaN })
      } else if (mode === 'ranking') {
        out.items.forEach(function (it, j) { chapters.push({ id: j + 1, pill: '', title: it.name, html: '', speech: it.name, accent: j % 2 ? 'b' : 'a' }) })
      } else chapters.push({ id: 1, pill: '', title: intro.title, html: esc(intro.description), speech: spoken(intro.description), accent: 'a', scene: mode === 'explainer' ? guess(intro.title + ' ' + intro.description, 'hook') : undefined })
    }
    if (DATA[mode]) { // contiguous ranges from 0 to n-1, in order, never out of bounds
      chapters.sort(function (x, y) { return (isFinite(x.startIdx) ? x.startIdx : 0) - (isFinite(y.startIdx) ? y.startIdx : 0) })
      var start = 0, keep = []
      for (var q = 0; q < chapters.length && start <= n - 1; q++) {
        var ch = chapters[q], last = q === chapters.length - 1
        ch.startIdx = start
        ch.endIdx = last ? n - 1 : clampN(isFinite(ch.endIdx) ? ch.endIdx : start, start, n - 1)
        keep.push(ch); start = ch.endIdx + 1
      }
      keep[keep.length - 1].endIdx = n - 1
      chapters = keep
    }
    chapters.forEach(function (ch, i) {
      ch.id = i + 1
      if (!ch.pill) ch.pill = DATA[mode] ? (out.data[ch.startIdx].label + (ch.endIdx > ch.startIdx ? '–' + out.data[ch.endIdx].label : '')).toUpperCase() : COUNTER[mode] + ' ' + (i + 1)
      if (!ch.title && !plain(ch.html) && DATA[mode]) ch.title = out.data[ch.startIdx].fullDate + ' → ' + out.data[ch.endIdx].fullDate
      if (ch.scene === undefined) delete ch.scene
    })
    out.chapters = chapters

    var p0 = obj(c0.provocation), l1 = cutRich(p0.line1 || '', 130), l2 = cutRich(p0.line2 || '', 170)
    if (!plain(l1) && !plain(l2)) { l1 = 'Adesso lo sai.'; l2 = 'La differenza la fa <span class="hl-gold">quello che fai oggi</span>.' }
    out.provocation = { line1: l1, line2: l2, speech: spoken(p0.speech, 340) || spoken(plain(l1) + ' ' + plain(l2), 340) }

    var t0 = obj(c0.cta), defs = /yourv/i.test(name) ? FEATURES_YV : FEATURES_GEN
    var feats = arr(t0.features).map(obj).map(function (f) { return { title: str(f.title, 34), desc: str(f.desc, 72) } }).filter(function (f) { return f.title }).slice(0, 4)
    while (feats.length < 4) feats.push(defs[feats.length])
    out.cta = {
      badge: str(t0.badge, 60) || 'Tutto più chiaro, in un posto solo.', subtitle: str(t0.subtitle, 110), features: feats,
      button: str(t0.button, 28) || 'Link in bio', speech: spoken(t0.speech, 260) || spoken('Scopri ' + name.replace(/€/g, 'e').replace(/\$/g, 's') + '. Link in bio.'), // "Yourvest", not "Yourv euro $t"
    }
    var tm = obj(c0.timing), tot = num(tm.totalDurationSec, 0)
    out.timing = { bodyEndP: clampN(num(tm.bodyEndP, num(tm.chartEndP, 0.72)), 0.3, 0.95), freezeEndP: clampN(num(tm.freezeEndP, 0.76), 0.3, 0.97), provEndP: clampN(num(tm.provEndP, 0.87), 0.3, 0.99) }
    if (tot > 0) out.timing.totalDurationSec = clampN(tot, 10, 180)
    if (isFinite(num(c0.speed, NaN))) out.speed = clampN(num(c0.speed, 1), 1, 2) // default playback speed for plan()
    out.disclaimer = str(c0.disclaimer, 120) || DISCLAIMER
    return out
  }

  /* ---------- plan: when every act and chapter starts ---------- */
  function shotOf(ch, brandName) { // the reel player's "shot" for a scene: which labels and figures it shows
    var text = (ch.title + ' ' + plain(ch.html) + ' ' + ch.speech), low = text.toLowerCase(), title = '', alt = ''
    if (ch.scene === 'confronto') {
      if (low.indexOf('distribuzion') >= 0 && low.indexOf('accumul') >= 0) { title = 'Distribuzione'; alt = 'Accumulo' } else {
        var parts = (ch.big || ch.title).split(/\s+(?:vs\.?|contro|o)\s+/i)
        title = cut(parts[0] || 'A', 14); alt = cut(parts[1] || 'B', 14)
      }
    }
    if (ch.scene === 'cta') { title = 'Prova ' + brandName; alt = 'Link in bio' }
    var dm = low.match(/\b([1-9]|[12]\d|3[01])\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)/)
    var ym = low.match(/\b(\d{1,2})\s+anni\b/)
    return { title: title, alt: alt, number: /\d/.test(ch.big || '') ? ch.big : numberIn(text), day: dm ? +dm[1] : 0, years: ym && +ym[1] >= 1 && +ym[1] <= 60 ? +ym[1] : 0 }
  }
  /** opts.durations (optional, final seconds, e.g. the real voice measured at opts.speed): {intro, chapters: [], provocation, cta}; without them time comes from word count.
      opts.speed (1–2, default config.speed or 1) divides every estimated duration and the animation pacing: 2 = half as long. */
  function plan(config, opts) {
    var cfg = validate(config), f = FORMATS[cfg.format], o = obj(opts), d = obj(o.durations), dc = arr(d.chapters)
    var sp = clampN(num(o.speed, cfg.speed || 1), 1, 2)
    var given = function (v) { v = num(v, 0); return v > 0 && v < 600 ? v : 0 }
    var est = function (text, min, extra) { return Math.max(min, words(text) / WPS2 + extra) / sp }
    var segs = [], t = 0
    var add = function (kind, dur, i, text) { var s = { kind: kind, i: i, start: t, dur: dur, end: t + dur, speech: say(text || '') }; segs.push(s); t += dur; return s }
    add('intro', given(d.intro) || est(cfg.intro.speech, 3.2, 0.6), 0, cfg.intro.speech)
    cfg.chapters.forEach(function (ch, i) {
      var min = DATA[cfg.mode] ? Math.max(2.6, 0.5 * (ch.endIdx - ch.startIdx + 1)) : cfg.mode === 'stat' ? 2.8 : 2.4
      var s = add('chapter', given(dc[i]) || est(ch.speech, min, 0.5), i, ch.speech)
      // the question is said first: its share of the words is how long the answer waits
      s.qd = ch.q ? clampN(s.dur * words(ch.q) / Math.max(words(ch.speech), words(ch.q) + 1), Math.min(0.6 / sp, s.dur * 0.3), s.dur * 0.45) : 0
    })
    add('freeze', FREEZE / sp, 0)
    add('provocation', given(d.provocation) || est(cfg.provocation.speech, 3.6, 0.9), 0, cfg.provocation.speech)
    add('cta', given(d.cta) || est(cfg.cta.speech, 4.6, 2.2), 0, cfg.cta.speech)
    var ch = segs.filter(function (s) { return s.kind === 'chapter' })
    var pl = {
      cfg: cfg, format: cfg.format, mode: cfg.mode, W: f.W, H: f.H, u: f.u, total: t, speed: sp, segs: segs, chSegs: ch,
      bodyStart: ch[0].start, bodyEnd: ch[ch.length - 1].end,
      speech: segs.filter(function (s) { return s.speech }).map(function (s) { return { at: s.start, end: s.end, kind: s.kind, i: s.i, text: s.speech } }),
      P: palette({ background: '#0B1224', highlight: cfg.palette.b, accent: cfg.palette.a }),
      shots: cfg.chapters.map(function (c1) { return c1.scene ? shotOf(c1, cfg.brand.name) : null }),
    }
    if (cfg.mode === 'ranking') { // bar k appears with chapter k, or evenly over the body when chapters are fewer
      var nIt = cfg.items.length
      pl.reveal = cfg.items.map(function (it, k) { return ch.length >= nIt ? ch[k].start + ch[k].qd : pl.bodyStart + k * (pl.bodyEnd - pl.bodyStart) / nIt })
    }
    pl.L = layout(cfg)
    return pl
  }
  function locate(pl, t) {
    var s = pl.segs[pl.segs.length - 1]
    for (var k = 0; k < pl.segs.length; k++) if (t < pl.segs[k].end) { s = pl.segs[k]; break }
    return { seg: s, lt: clampN(t - s.start, 0, s.dur) }
  }
  function chapterAt(pl, bt) {
    var cs = pl.chSegs
    // lt, dur, qd: real seconds; a = lt × speed, the animation clock (every fixed animation timing is written for 1×)
    if (bt < pl.bodyStart) return { i: 0, lt: 0, a: 0, dur: cs[0].dur, qd: 0, p: 0, pre: true }
    for (var i = cs.length - 1; i >= 0; i--) if (bt >= cs[i].start) { var lt = Math.min(bt - cs[i].start, cs[i].dur); return { i: i, lt: lt, a: lt * pl.speed, dur: cs[i].dur, qd: cs[i].qd, p: lt / cs[i].dur } }
  }
  /** Position along the data (0 … n-1) at body time bt: each chapter runs from its startIdx to the next one's. */
  function fidx(pl, bt) {
    var cfg = pl.cfg, n = cfg.data.length, st = chapterAt(pl, bt), chs = cfg.chapters
    if (st.pre) return 0
    var last = st.i === chs.length - 1, to = last ? n - 1 : chs[st.i + 1].startIdx
    var p = last ? clamp01(st.lt / Math.max(0.1, st.dur - 0.4)) : st.p
    return lerp(chs[st.i].startIdx, to, p)
  }
  function interp(cfg, fi) {
    var d = cfg.data, m = d.length - 1
    fi = clampN(fi, 0, m)
    var i0 = Math.floor(fi), i1 = Math.min(m, i0 + 1), f = fi - i0, p0 = d[i0], p1 = d[i1], nr = f < 0.5 ? p0 : p1
    return { fi: fi, i0: i0, a: p0.a + (p1.a - p0.a) * f, b: p0.b == null ? 0 : p0.b + (p1.b - p0.b) * f, label: nr.label, fullDate: nr.fullDate }
  }
  function leader(cfg, a, b) {
    var diff = cfg.unit.higherIsBetter ? a - b : b - a
    if (Math.abs(diff) < 0.01) return { who: 'tie', gap: 0 }
    return { who: diff > 0 ? 'a' : 'b', gap: Math.abs(a - b) }
  }
  /** Italian number, always grouped: 1.153,8 (by hand: Intl groups 4-digit numbers differently per engine). */
  function nf(v, dec) { var p = Math.abs(v).toFixed(dec).split('.'); return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (p[1] ? ',' + p[1] : '') }
  function fmtV(un, v) { return (v < -1e-4 ? un.negativePrefix : un.prefix) + nf(v, un.decimals) + un.suffix }
  function fmtS(un, g) { return nf(g, un.decimals) + un.spreadSuffix }

  /* ---------- layout per format (logical px; u = scale of the template's CSS px) ---------- */
  function layout(cfg) {
    var f = FORMATS[cfg.format], W = f.W, H = f.H, u = f.u, wide = cfg.format === '16:9', tall = cfg.format === '9:16'
    var pad = (wide ? 40 : tall ? 28 : 22) * u
    var top = tall ? 96 : 18 * u, bottom = tall ? H - 250 : H - 12 * u // reels: keep clear of the app's buttons and caption at the bottom
    var header = { x: pad, y: top, w: W - 2 * pad, h: (wide ? 38 : 40) * u }
    var sub = !wide && cfg.headerSubtitle ? 18 * u : 0
    var bar = { x: pad, y: header.y + header.h + sub + 6 * u, w: W - 2 * pad, h: 3 * u }
    var disc = { x: pad, y: bottom - 10 * u, w: W - 2 * pad }
    var y0 = bar.y + bar.h + 10 * u, y1 = disc.y - 14 * u, gap = 10 * u
    var bannerH = (wide ? 104 : tall ? 196 : 148) * u
    var banner = { x: pad, y: y1 - bannerH, w: W - 2 * pad, h: bannerH }
    var vis = { x: pad, y: y0, w: W - 2 * pad, h: banner.y - gap - y0 }
    var kpiH = DATA[cfg.mode] ? (wide ? 64 : tall ? 78 : 66) * u : 0
    return {
      W: W, H: H, u: u, pad: pad, wide: wide, tall: tall, header: header, sub: sub, bar: bar, disc: disc, y0: y0, y1: y1, banner: banner, vis: vis,
      kpi: { x: pad, y: y0, w: vis.w, h: kpiH }, chart: { x: pad, y: y0 + (kpiH ? kpiH + gap : 0), w: vis.w, h: vis.h - (kpiH ? kpiH + gap : 0) },
    }
  }

  /* ---------- text on canvas ---------- */
  function setF(w, s, fam) { c.font = w + ' ' + s.toFixed(1) + 'px ' + (fam || FD) }
  /** Wraps words in maxW, shrinking the size until they fit maxH. */
  function fit(tk, maxW, maxH, size, min, w, fam, lh) {
    lh = lh || 1.22; w = w || 700
    for (;;) {
      var lines = [], cur = null, widest = 0
      setF(w, size, fam); var sp = c.measureText(' ').width
      for (var i = 0; i < tk.length; i++) {
        var k = tk[i]
        if (k.br) { cur = null; continue }
        setF(k.bold ? 800 : w, size, fam)
        var kw = c.measureText(k.t).width + (k.chip ? size * 0.7 : 0)
        var g = cur && cur.items.length && k.gap ? sp : 0
        if (!cur || (cur.items.length && cur.w + g + kw > maxW)) { cur = { w: 0, items: [] }; lines.push(cur); g = 0 }
        cur.items.push({ k: k, x: cur.w + g, w: kw }); cur.w += g + kw
        widest = Math.max(widest, cur.w)
      }
      if ((lines.length * size * lh <= maxH + 0.5 && widest <= maxW + 0.5) || size <= min) return { size: size, lines: lines, lh: lh, h: lines.length * size * lh, w: widest, wt: w, fam: fam }
      size = Math.max(min, size * 0.92)
    }
  }
  function colOf(pa, k, base) { return k === 'a' ? pa.a : k === 'b' ? pa.b : k === 'gold' ? pa.gold : k === 'w' ? '#ffffff' : base }
  /** Draws a fit() block with its top at y; align left/center/right around x. Returns its height. */
  function paint(F, x, y, align, base, pa) {
    c.textBaseline = 'middle'; c.textAlign = 'left'
    F.lines.forEach(function (ln, i) {
      var cy = y + (i + 0.5) * F.size * F.lh, x0 = align === 'center' ? x - ln.w / 2 : align === 'right' ? x - ln.w : x
      ln.items.forEach(function (it) {
        var k = it.k, col = colOf(pa, k.col, base), tx = x0 + it.x
        setF(k.bold ? 800 : F.wt, F.size, F.fam)
        if (k.chip) { var ph = F.size * 1.3; rr(tx, cy - ph / 2, it.w, ph, F.size * 0.3); fill(A(col, 0.15)); stroke(A(col, 0.45), Math.max(1, F.size * 0.05)); tx += F.size * 0.35 }
        c.fillStyle = col; c.fillText(k.t, tx, cy)
        if (k.und) { c.fillStyle = A(pa.a, 0.7); c.fillRect(tx, cy + F.size * 0.55, it.w, Math.max(2, F.size * 0.09)) }
      })
    })
    return F.h
  }
  /** One line of text, cut with … to maxW. */
  function line(s, x, y, maxW, col, align) {
    s = String(s || '')
    if (c.measureText(s).width > maxW) { while (s.length > 1 && c.measureText(s + '…').width > maxW) s = s.slice(0, -1); s = s.replace(/\s+$/, '') + '…' }
    c.fillStyle = col; c.textAlign = align || 'left'; c.textBaseline = 'middle'; c.fillText(s, x, y)
    return c.measureText(s).width
  }
  /** One line shrunk (not cut) to maxW. */
  function shrinkLine(s, w, size, fam, x, y, maxW, col, align) {
    setF(w, size, fam); var tw = c.measureText(s).width
    if (tw > maxW) setF(w, size * maxW / tw, fam)
    c.fillStyle = col; c.textAlign = align || 'left'; c.textBaseline = 'middle'; c.fillText(s, x, y)
  }
  function kin(lt, delay, dist) { var a = easeOut(prog(lt, delay, delay + 0.45)); return { a: a, dy: (1 - a) * dist } }
  function withKin(k, fn) { if (k.a <= 0) return; c.save(); c.globalAlpha *= k.a; c.translate(0, k.dy); try { fn() } finally { c.restore() } }
  function box(R, r, fillS, strokeS, lw) { rr(R.x, R.y, R.w, R.h, r); fill(fillS); if (strokeS) stroke(strokeS, lw || 1) }
  function logoBox(x, y, s, pa) {
    rr(x, y, s, s, s * 0.28); fill(grad(pa.a, pa.b, x, y, s, s))
    var k = s * 0.6 / 24
    c.save(); c.translate(x + s * 0.2, y + s * 0.2); c.scale(k, k)
    c.beginPath(); c.moveTo(3, 17); c.lineTo(9, 11); c.lineTo(13, 15); c.lineTo(21, 7); c.moveTo(16, 7); c.lineTo(21, 7); c.lineTo(21, 12)
    stroke('#020617', 2.8, 'round', 'round'); c.restore()
  }
  function pill(text, x, y, size, col, align) { // y = centre
    setF(800, size, FM)
    var w = c.measureText(text).width + size * 1.6, h = size * 2
    var x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
    rr(x0, y - h / 2, w, h, size * 0.55); fill(A(col, 0.18)); stroke(A(col, 0.45), Math.max(1, size * 0.09))
    c.fillStyle = col; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(text, x0 + size * 0.8, y + 0.5)
    return w
  }

  /* ---------- background, header, timeline, disclaimer ---------- */
  function backdrop(pl, t) {
    var W = pl.W, H = pl.H, u = pl.u, pa = pl.cfg.palette, R = Math.max(W, H)
    c.fillStyle = BG; c.fillRect(0, 0, W, H)
    glow(W * (0.14 + 0.03 * sin(t * 0.3)), H * (0.14 + 0.02 * cos(t * 0.25)), R * 0.48, pa.a, 0.14)
    glow(W * (0.86 + 0.03 * cos(t * 0.27)), H * (0.86 + 0.02 * sin(t * 0.22)), R * 0.48, pa.b, 0.13)
    var g = 28 * u
    c.beginPath()
    for (var x = 0; x <= W; x += g) { c.moveTo(x, 0); c.lineTo(x, H) }
    for (var y = 0; y <= H; y += g) { c.moveTo(0, y); c.lineTo(W, y) }
    c.strokeStyle = 'rgba(148,163,184,0.045)'; c.lineWidth = 1; c.stroke()
  }
  function header(pl, t) {
    var L = pl.L, h = L.header, u = pl.u, cfg = pl.cfg, pa = cfg.palette, cy = h.y + h.h / 2, s = 28 * u
    logoBox(h.x, cy - s / 2, s, pa)
    var x = h.x + s + 9 * u, right = h.x + h.w
    setF(700, 15 * u, FD)
    x += line(cfg.brand.name, x, cy, h.w * 0.4, '#fff') + 12 * u
    var tag = MODE_TAG[cfg.mode]
    setF(700, 10 * u, FM)
    var bw = c.measureText(tag).width + 27 * u, bh = 21 * u
    rr(x, cy - bh / 2, bw, bh, bh / 2); fill('#0f172a'); stroke('#334155', u)
    circ(x + 10 * u, cy, 3.2 * u); fill(A(pa.a, 0.55 + 0.45 * sin(t * 4)))
    c.fillStyle = '#e2e8f0'; c.textAlign = 'left'; c.fillText(tag, x + 17 * u, cy + 0.5)
    x += bw + 12 * u
    var sw = 0
    if (cfg.sector) {
      setF(500, 11 * u, FM)
      sw = Math.min(c.measureText(cfg.sector).width + 20 * u, Math.max(0, right - x))
      if (sw > 60 * u) { rr(right - sw, cy - 13 * u, sw, 26 * u, 8 * u); fill('rgba(15,23,42,0.9)'); stroke('#1e293b', u); line(cfg.sector, right - sw + 10 * u, cy + 0.5, sw - 20 * u, '#94a3b8') } else sw = 0
    }
    if (cfg.headerSubtitle) {
      setF(700, 13 * u, FD)
      if (L.wide) { if (right - sw - 16 * u - x > 80 * u) line(cfg.headerSubtitle, x, cy, right - sw - 16 * u - x, '#cbd5e1') } else line(cfg.headerSubtitle, h.x, h.y + h.h + L.sub / 2, h.w, '#cbd5e1')
    }
  }
  function timeline(pl, t) {
    var b = pl.L.bar, pa = pl.cfg.palette, u = pl.u, p = clamp01(t / pl.total)
    rr(b.x, b.y, b.w, b.h, b.h / 2); fill('rgba(30,41,59,0.95)')
    if (p > 0) { rr(b.x, b.y, b.w * p, b.h, b.h / 2); fill(grad(pa.a, pa.b, b.x, 0, b.w, 0)) }
    c.fillStyle = BG
    pl.chSegs.forEach(function (s, i) { if (i) c.fillRect(b.x + b.w * s.start / pl.total - u, b.y, 2 * u, b.h) })
    var fx = b.x + b.w * pl.bodyEnd / pl.total
    c.save(); c.shadowColor = pa.gold; c.shadowBlur = 8 * u; c.fillStyle = pa.gold; c.fillRect(fx - 1.5 * u, b.y - 1.5 * u, 3 * u, b.h + 3 * u); c.restore()
  }
  function disclaimer(pl) {
    var d = pl.L.disc, u = pl.u
    shrinkLine(pl.cfg.disclaimer, 500, (pl.L.tall ? 11.5 : 10.5) * u, FD, pl.W / 2, d.y, d.w, 'rgba(148,163,184,0.85)', 'center')
  }

  /* ---------- live commentary (broadcast lower-third) ---------- */
  function banner(pl, R, bt) {
    var cfg = pl.cfg, u = pl.u, pa = cfg.palette, st = chapterAt(pl, bt), ch = cfg.chapters[st.i]
    var acc = colOf(pa, ch.accent, pa.a)
    if (cfg.mode === 'race') { var ip = interp(cfg, fidx(pl, bt)), ld = leader(cfg, ip.a, ip.b); acc = ld.who === 'b' ? pa.b : pa.a }
    c.save(); c.shadowColor = A(acc, 0.32); c.shadowBlur = 30 * u; c.shadowOffsetY = 8 * u
    box(R, 16 * u, grad('rgba(11,18,36,0.97)', 'rgba(8,13,27,0.97)', R.x, R.y, R.w, R.h)); c.restore()
    rr(R.x, R.y, R.w, R.h, 16 * u); stroke(A(acc, 0.5), 1.5 * u)
    c.save(); rr(R.x, R.y, R.w, R.h, 16 * u); c.clip()
    c.fillStyle = 'rgba(30,41,59,0.9)'; c.fillRect(R.x, R.y, R.w, 3 * u)
    c.fillStyle = acc; c.fillRect(R.x, R.y, R.w * (st.pre ? 0 : st.p), 3 * u)
    var pc = colOf(pa, ch.accent, pa.a), counter = COUNTER[cfg.mode] + ' ' + (st.i + 1) + ' DI ' + cfg.chapters.length
    var pd = 16 * u, qa = st.pre ? 0 : st.qd * pl.speed, k = kin(st.a, qa, 14 * u), tx, tw, ty, th
    if (pl.L.wide) {
      var colW = 190 * u
      pill(ch.pill, R.x + pd, R.y + R.h / 2 - 13 * u, 11 * u, pc)
      setF(600, 11 * u, FM); line(counter, R.x + pd, R.y + R.h / 2 + 17 * u, colW - pd, '#94a3b8')
      c.fillStyle = 'rgba(51,65,85,0.7)'; c.fillRect(R.x + colW, R.y + 18 * u, u, R.h - 36 * u)
      tx = R.x + colW + 20 * u; tw = R.w - colW - 20 * u - pd; ty = R.y + 14 * u; th = R.h - 26 * u
    } else {
      pill(ch.pill, R.x + pd, R.y + 16 * u + 11 * u, 11 * u, pc)
      setF(600, 11 * u, FM); line(counter, R.x + R.w - pd, R.y + 27 * u, R.w * 0.35, '#94a3b8', 'right')
      tx = R.x + pd; tw = R.w - 2 * pd; ty = R.y + 52 * u; th = R.h - 52 * u - 14 * u
    }
    // the question (muted, said first), then the answer: title + text
    var qF = ch.q ? fit(toks(ch.q), tw, th * 0.3, (pl.L.tall ? 16 : 14.5) * u, 10 * u, 'italic 600', FD, 1.15) : null, qh = qF ? qF.h + 5 * u : 0
    if (qF) withKin(kin(st.a, 0, 10 * u), function () { paint(qF, tx, ty, 'left', '#94a3b8', pa) })
    withKin(k, function () {
      var tF = ch.title ? fit(toks(ch.title), tw, Math.min((th - qh) * 0.45, 2 * 21 * u * 1.18), 21 * u, 13 * u, 700, FD, 1.16) : null
      var used = qh + (tF ? paint(tF, tx, ty + qh, 'left', '#ffffff', pa) + 6 * u : 0)
      var body = rich(ch.html)
      if (body.length) paint(fit(body, tw, th - used, (pl.L.tall ? 17 : 15.5) * u, 10 * u, 500, FD, 1.32), tx, ty + used, 'left', 'rgba(226,232,240,0.95)', pa)
    })
    c.restore()
  }

  /* ---------- body visuals per mode ---------- */
  function panelBox(R, u) { box(R, 16 * u, 'rgba(5,9,20,0.9)', 'rgba(30,41,59,0.9)', u) }
  function watermark(pl, R, text) {
    if (!text) return
    var u = pl.u
    setF(500, 10 * u, FM)
    var w = Math.min(c.measureText(text).width + 14 * u, R.w - 24 * u)
    rr(R.x + 12 * u, R.y + 10 * u, w, 20 * u, 6 * u); fill('rgba(15,23,42,0.85)'); stroke('#1e293b', u)
    line(text, R.x + 19 * u, R.y + 20 * u, w - 14 * u, '#94a3b8')
  }
  function niceStep(range, lines) { var rough = Math.max(1e-9, range) / lines, pw = Math.pow(10, Math.floor(Math.log10(rough))), fr = rough / pw; return (fr <= 1.2 ? 1 : fr <= 2.5 ? 2 : fr <= 5.5 ? 5 : 10) * pw }
  function smooth(pts) {
    c.moveTo(pts[0].x, pts[0].y)
    if (pts.length === 2) { c.lineTo(pts[1].x, pts[1].y); return }
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)]
      c.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y)
    }
  }
  function tip(x, y, core, r, u) { circ(x, y, r); fill(A(core, 0.3)); circ(x, y, 4.2 * u); fill(core); stroke('#fff', 1.4 * u) }
  function tag(pl, x, y, text, col, maxX) {
    var u = pl.u
    setF(700, 11 * u, FM)
    var w = c.measureText(text).width + 12 * u, h = 22 * u, bx = Math.min(x, maxX - w)
    rr(bx, y - h / 2, w, h, 6 * u); fill('rgba(7,12,24,0.94)'); stroke(col, 1.3 * u)
    c.fillStyle = '#f8fafc'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(text, bx + 6 * u, y + 0.5)
  }
  function lineChart(pl, R, ip, now) {
    var cfg = pl.cfg, u = pl.u, data = cfg.data, maxIdx = Math.max(1, data.length - 1), two = cfg.mode === 'race', un = cfg.unit
    var colA = cfg.series.a.color, colB = two ? cfg.series.b.color : colA
    panelBox(R, u)
    var narrow = R.w < 1100
    var pad = { top: 40 * u, right: (narrow ? 104 : 122) * u, bottom: 26 * u, left: (narrow ? 54 : 66) * u }
    var plotW = Math.max(60, R.w - pad.left - pad.right), plotH = Math.max(60, R.h - pad.top - pad.bottom)
    var X0 = R.x + pad.left, Y0 = R.y + pad.top
    // y range: everything drawn so far (continuous in time, so no smoothing state is needed)
    var hi = two ? Math.max(ip.a, ip.b) : ip.a, lo = two ? Math.min(ip.a, ip.b) : ip.a
    for (var i = 0; i <= ip.i0; i++) { hi = Math.max(hi, data[i].a, two ? data[i].b : data[i].a); lo = Math.min(lo, data[i].a, two ? data[i].b : data[i].a) }
    var range = Math.max(Math.abs(hi) * 0.05 + 1e-6, 10 * Math.pow(10, -un.decimals), hi - lo)
    var yMin = lo - range * 0.14, yMax = hi + range * 0.2
    var xOf = function (k) { return X0 + (k / maxIdx) * plotW }, yOf = function (v) { return Y0 + plotH - ((v - yMin) / Math.max(1e-9, yMax - yMin)) * plotH }
    // grid Y
    var step = niceStep(yMax - yMin, R.h < 340 * u ? 4 : 5), first = Math.ceil(yMin / step) * step
    setF(700, 10.5 * u, FM); c.textAlign = 'right'; c.textBaseline = 'middle'
    for (var v = first; v <= yMax; v += step) {
      var y = yOf(v), base = Math.abs(v - un.baselineValue) < step * 0.1
      c.beginPath(); c.moveTo(X0, y); c.lineTo(X0 + plotW, y)
      c.setLineDash(base ? [4 * u, 4 * u] : []); c.strokeStyle = base ? 'rgba(148,163,184,0.34)' : 'rgba(148,163,184,0.08)'; c.lineWidth = u; c.stroke(); c.setLineDash([])
      var lbl = Math.abs(v) >= 10000 ? (un.prefix.indexOf('€') >= 0 ? '€' : '') + nf(v / 1000, Math.abs(v) >= 100000 ? 0 : 1) + 'k' : (v < 0 ? '-' : '') + nf(v, step < 1 ? 1 : 0) + un.suffix.trim()
      c.fillStyle = base ? '#e2e8f0' : '#64748b'; c.fillText(lbl, X0 - 8 * u, y)
    }
    // grid X
    setF(600, 10 * u, FM); c.textAlign = 'center'; c.textBaseline = 'top'
    var stepX = Math.max(1, Math.ceil(data.length / (narrow ? 5 : 8)))
    for (i = 0; i < data.length; i += stepX) {
      var x = xOf(i)
      c.beginPath(); c.moveTo(x, Y0); c.lineTo(x, Y0 + plotH); c.strokeStyle = 'rgba(148,163,184,0.05)'; c.lineWidth = u; c.stroke()
      c.fillStyle = i <= ip.fi + 0.2 ? '#94a3b8' : '#334155'; c.fillText(data[i].label, x, Y0 + plotH + 7 * u)
    }
    watermark(pl, R, cfg.chartWatermark)
    // traced points
    var pa = [], pb = []
    for (i = 0; i <= ip.i0; i++) { pa.push({ x: xOf(i), y: yOf(data[i].a), v: data[i].a }); if (two) pb.push({ x: xOf(i), y: yOf(data[i].b), v: data[i].b }) }
    var tx = xOf(ip.fi), tyA = yOf(ip.a), tyB = yOf(ip.b)
    if (ip.fi > ip.i0 + 1e-6) { pa.push({ x: tx, y: tyA, v: ip.a }); if (two) pb.push({ x: tx, y: tyB, v: ip.b }) }
    if (two && pa.length >= 2) { // spread coloured by who leads
      for (i = 0; i < pa.length - 1; i++) {
        var ld = leader(cfg, (pa[i].v + pa[i + 1].v) / 2, (pb[i].v + pb[i + 1].v) / 2)
        path([[pa[i].x, pa[i].y], [pa[i + 1].x, pa[i + 1].y], [pb[i + 1].x, pb[i + 1].y], [pb[i].x, pb[i].y]], true); fill(A(ld.who === 'b' ? colB : colA, 0.16))
      }
    }
    if (!two && pa.length >= 2) { // area under the single line
      c.beginPath(); smooth(pa); c.lineTo(pa[pa.length - 1].x, Y0 + plotH); c.lineTo(pa[0].x, Y0 + plotH); c.closePath()
      fill(grad(A(colA, 0.28), A(colA, 0), 0, Y0, 0, plotH))
    }
    ;[[pb, colB, 3, 14], [pa, colA, 3.2, 16]].forEach(function (s) {
      if (s[0].length < 2) return
      c.save(); c.beginPath(); smooth(s[0]); c.strokeStyle = s[1]; c.lineWidth = s[2] * u; c.lineCap = 'round'; c.lineJoin = 'round'
      c.shadowColor = A(s[1], 0.88); c.shadowBlur = s[3] * u; c.stroke(); c.restore()
    })
    // milestones: a ring wave when reached, then a badge
    cfg.milestones.forEach(function (m) {
      if (ip.fi < m.idx) return
      var age = ip.fi - m.idx, dd = data[m.idx], nx = xOf(m.idx), ny = yOf(m.target === 'b' ? dd.b : dd.a)
      c.save()
      if (age < 1.8) { var wp = age / 1.8; c.globalAlpha = (1 - wp) * 0.85; circ(nx, ny, (6 + wp * 24) * u); stroke(m.color, 2.2 * u) }
      c.globalAlpha = Math.min(1, age * 2 + 0.35)
      circ(nx, ny, 4.5 * u); fill(BG); stroke(m.color, 2.2 * u)
      setF(700, 10 * u, FD)
      var pw = c.measureText(m.label).width + 14 * u, ph = 20 * u
      var ox = clampN(nx - pw / 2, X0 + 4 * u, X0 + plotW - pw - 4 * u), oy = clampN(ny + (m.dir === 'bottom' ? 13 : -29) * u, Y0 + 2 * u, Y0 + plotH - ph - 2 * u)
      rr(ox, oy, pw, ph, 6 * u); fill('rgba(5,8,17,0.92)'); stroke(m.color, 1.1 * u)
      c.fillStyle = '#f8fafc'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(m.label, ox + pw / 2, oy + ph / 2 + 0.5)
      c.restore()
    })
    var pulse = 0.5 + 0.5 * sin(now / 0.18)
    if (two) tip(tx, tyB, colB, (8 + pulse * 4) * u, u)
    tip(tx, tyA, colA, (8 + pulse * 4) * u, u)
    var lyA = tyA, lyB = tyB, gapY = 25 * u
    if (two && Math.abs(lyA - lyB) < gapY) { var mid = (lyA + lyB) / 2; if (lyA <= lyB) { lyA = mid - gapY / 2; lyB = mid + gapY / 2 } else { lyB = mid - gapY / 2; lyA = mid + gapY / 2 } }
    var maxX = R.x + R.w - 4 * u
    tag(pl, tx + 10 * u, clampN(lyA, Y0 + 12 * u, Y0 + plotH - 12 * u), cfg.series.a.ticker + ' ' + fmtV(un, ip.a), colA, maxX)
    if (two) tag(pl, tx + 10 * u, clampN(lyB, Y0 + 12 * u, Y0 + plotH - 12 * u), cfg.series.b.ticker + ' ' + fmtV(un, ip.b), colB, maxX)
  }
  function kpiCard(pl, R, s, value, sub, isLead, col) {
    var u = pl.u, p = 12 * u
    box(R, 12 * u, 'rgba(15,23,42,0.9)', isLead ? A(col, 0.75) : 'rgba(51,65,85,0.6)', (isLead ? 1.6 : 1) * u)
    var top = R.y + R.h * 0.22, narrow = R.w < 180 * u // three cards side by side on a reel: badge is just a star, no ticker
    circ(R.x + p + 5 * u, top, 5 * u); fill(col)
    var badge = 0, bl = narrow ? '★' : '★ LEADER'
    if (isLead) {
      setF(800, 9 * u, FD); badge = c.measureText(bl).width + 14 * u
      rr(R.x + R.w - p - badge, top - 9 * u, badge, 18 * u, 9 * u); fill(col)
      c.fillStyle = '#020617'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(bl, R.x + R.w - p - badge / 2, top + 0.5)
    }
    setF(700, 13 * u, FD); var nw = line(s.name, R.x + p + 15 * u, top, R.w - 2 * p - 15 * u - badge - 6 * u, '#fff')
    if (s.ticker && s.ticker !== s.name && !narrow) { setF(500, 10 * u, FM); var room = R.w - 2 * p - 15 * u - badge - 12 * u - nw - 6 * u; if (room > 40 * u) line(s.ticker, R.x + p + 15 * u + nw + 6 * u, top, room, '#94a3b8') }
    shrinkLine(value, 800, 26 * u, FM, R.x + p, R.y + R.h * 0.56, R.w - 2 * p, col)
    if (sub) { setF(600, 11 * u, FD); line(sub, R.x + p, R.y + R.h * 0.84, R.w - 2 * p, '#94a3b8') }
  }
  function kpiRow(pl, R, ip) {
    var cfg = pl.cfg, u = pl.u, un = cfg.unit, pa = cfg.palette, g = 8 * u
    if (cfg.mode === 'race') {
      var w = (R.w - 2 * g) / 3, ld = leader(cfg, ip.a, ip.b)
      kpiCard(pl, { x: R.x, y: R.y, w: w, h: R.h }, cfg.series.a, fmtV(un, ip.a), cfg.series.a.subLabel, ld.who === 'a', pa.a)
      kpiCard(pl, { x: R.x + w + g, y: R.y, w: w, h: R.h }, cfg.series.b, fmtV(un, ip.b), cfg.series.b.subLabel, ld.who === 'b', pa.b)
      var S2 = { x: R.x + 2 * (w + g), y: R.y, w: w, h: R.h }, p = 12 * u, wc = ld.who === 'b' ? pa.b : ld.who === 'a' ? pa.a : '#e2e8f0'
      box(S2, 12 * u, 'rgba(15,23,42,0.9)', 'rgba(51,65,85,0.7)', u)
      var top = S2.y + S2.h * 0.22, bt = ld.who === 'tie' ? 'PARITÀ' : (ld.who === 'a' ? cfg.series.a.ticker : cfg.series.b.ticker) + ' IN TESTA', nar = S2.w < 180 * u
      setF(800, 9.5 * u, FM); var bw = Math.min(c.measureText(bt).width + 12 * u, nar ? S2.w - 2 * p : S2.w * 0.6)
      rr(S2.x + S2.w - p - bw, top - 9 * u, bw, 18 * u, 5 * u); fill(ld.who === 'tie' ? '#1e293b' : A(wc, 0.18)); stroke(ld.who === 'tie' ? '#334155' : A(wc, 0.45), u)
      line(bt, S2.x + S2.w - p - bw / 2, top + 0.5, bw - 8 * u, ld.who === 'tie' ? '#cbd5e1' : wc, 'center')
      setF(700, 12 * u, FD)
      if (nar) line(ip.fullDate.toUpperCase(), S2.x + S2.w - p, S2.y + S2.h * 0.53, S2.w * 0.42 - p, '#cbd5e1', 'right') // narrow: date beside the value, badge alone on top
      else line(ip.fullDate.toUpperCase(), S2.x + p, top, S2.w - 2 * p - bw - 6 * u, '#fff')
      shrinkLine(fmtS(un, ld.gap), 800, 22 * u, FM, S2.x + p, S2.y + S2.h * 0.53, S2.w * (nar ? 0.56 : 0.62) - p, wc)
      setF(700, 10.5 * u, FM); if (!nar) line(ld.who === 'tie' ? 'Equilibrio' : un.higherIsBetter ? 'Vantaggio' : 'Risparmio', S2.x + S2.w - p, S2.y + S2.h * 0.53, S2.w * 0.36 - p, '#94a3b8', 'right')
      var sum = Math.abs(ip.a) + Math.abs(ip.b), sh = sum > 0.01 ? Math.abs(ip.a) / sum : 0.5
      if (!un.higherIsBetter) sh = 1 - sh
      sh = clampN(sh, 0.16, 0.84)
      var by = S2.y + S2.h * 0.82, bw2 = S2.w - 2 * p
      c.save(); rr(S2.x + p, by, bw2, 6 * u, 3 * u); c.clip()
      c.fillStyle = pa.a; c.fillRect(S2.x + p, by, bw2 * sh, 6 * u); c.fillStyle = pa.b; c.fillRect(S2.x + p + bw2 * sh, by, bw2 * (1 - sh), 6 * u); c.restore()
    } else {
      var w1 = (R.w - g) * 0.58, first = cfg.data[0].a, delta = ip.a - first, good = un.higherIsBetter ? delta >= 0 : delta <= 0
      kpiCard(pl, { x: R.x, y: R.y, w: w1, h: R.h }, cfg.series.a, fmtV(un, ip.a), cfg.series.a.subLabel, false, pa.a)
      var D = { x: R.x + w1 + g, y: R.y, w: R.w - w1 - g, h: R.h }, q = 12 * u
      box(D, 12 * u, 'rgba(15,23,42,0.9)', 'rgba(51,65,85,0.7)', u)
      setF(700, 12 * u, FD); line(ip.fullDate.toUpperCase(), D.x + q, D.y + D.h * 0.22, D.w - 2 * q, '#fff')
      shrinkLine((delta >= 0 ? '+' : '-') + fmtV({ prefix: un.prefix.replace(/[+-]/g, ''), negativePrefix: un.prefix.replace(/[+-]/g, ''), suffix: un.suffix, decimals: un.decimals }, Math.abs(delta)), 800, 22 * u, FM, D.x + q, D.y + D.h * 0.56, D.w - 2 * q, good ? pa.b : '#F43F5E')
      setF(600, 11 * u, FD); line('dall’inizio', D.x + q, D.y + D.h * 0.84, D.w - 2 * q, '#94a3b8')
    }
  }
  function ranking(pl, R, bt, now) {
    var cfg = pl.cfg, u = pl.u, pa = cfg.palette, items = cfg.items, n = items.length, un = cfg.unit
    panelBox(R, u); watermark(pl, R, cfg.chartWatermark || 'CLASSIFICA')
    var max = Math.max.apply(null, items.map(function (it) { return Math.abs(it.value) })) || 1
    var best = items.reduce(function (b, it, k) { return (un.higherIsBetter ? it.value > items[b].value : it.value < items[b].value) ? k : b }, 0)
    var top = R.y + 44 * u, rowH = Math.min((R.h - 44 * u - 16 * u) / n, 74 * u), p = 18 * u, cyc = [pa.a, pa.b, pa.gold, mix(pa.a, pa.b, 0.5)]
    var allIn = bt >= pl.reveal[n - 1] + 0.9
    items.forEach(function (it, k) {
      var y = top + k * rowH + (R.h - 60 * u - rowH * n) / 2, since = (bt - pl.reveal[k]) * pl.speed, on = since >= 0
      var col = it.color || cyc[k % cyc.length], g = easeOut(prog(since, 0, 0.9))
      c.save(); c.globalAlpha *= on ? 0.35 + 0.65 * easeOut(prog(since, 0, 0.4)) : 0.25
      var nameSize = Math.min(15 * u, rowH * 0.3), trackY = y + rowH * 0.52, trackH = Math.min(14 * u, rowH * 0.24)
      setF(700, nameSize, FD); line((k + 1) + '. ' + it.name + (on && allIn && k === best ? '  ★' : ''), R.x + p, y + rowH * 0.26, R.w * 0.62, on && allIn && k === best ? pa.gold : '#fff')
      setF(800, nameSize, FM); line(on ? fmtV(un, it.value * g) : '—', R.x + R.w - p, y + rowH * 0.26, R.w * 0.34, on ? col : '#475569', 'right')
      rr(R.x + p, trackY, R.w - 2 * p, trackH, trackH / 2); fill('rgba(30,41,59,0.9)')
      var bw = (R.w - 2 * p) * Math.abs(it.value) / max * g
      if (bw > 1) { c.save(); c.shadowColor = A(col, 0.7); c.shadowBlur = 12 * u; rr(R.x + p, trackY, bw, trackH, trackH / 2); fill(grad(A(col, 0.65), col, R.x + p, 0, bw, 0)); c.restore() }
      if (on && since < 1.2) { var wp = since / 1.2; circ(R.x + p + bw, trackY + trackH / 2, (6 + 22 * wp) * u); stroke(A(col, 1 - wp), 2 * u) }
      c.restore()
    })
  }
  /** lt and dur on the animation clock (×speed). */
  function sceneBox(pl, i, lt, dur, x, y, s, alpha) {
    var ch = pl.cfg.chapters[i]
    if (!ch || !S[ch.scene] || alpha <= 0) return
    c.save(); c.globalAlpha *= clamp01(alpha); c.translate(x, y); c.scale(s / 900, s / 900)
    c.beginPath(); c.rect(0, 0, 900, 900); c.clip()
    try { S[ch.scene](lt, Math.max(dur, 1), pl.shots[i]) } finally { c.restore() }
  }
  /** The chapter's question, big in the visual area, before its answer shows. */
  function qCard(pl, R, q, al, acc) {
    if (!q || al <= 0) return
    var u = pl.u, F = fit(toks(q), R.w * 0.86, R.h * 0.42, (pl.L.wide ? 46 : 40) * u, 18 * u, 800, FD, 1.12), lh = 22 * u, y = R.y + (R.h - lh - 14 * u - F.h) / 2
    c.save(); c.globalAlpha *= clamp01(al)
    setF(700, 12 * u, FM); c.fillStyle = acc; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('LA DOMANDA', R.x + R.w / 2, y + lh / 2)
    paint(F, R.x + R.w / 2, y + lh + 14 * u, 'center', '#e2e8f0', pl.cfg.palette)
    c.restore()
  }
  /** Question card alpha at animation time a: in, then out as the answer arrives at qa. */
  function qAlpha(a, qa) { return qa > 0 ? ease(prog(a, 0.02, 0.3)) * (1 - ease(prog(a, qa - 0.1, qa + 0.2))) : 0 }
  function bigText(pl, text, x, y, maxW, maxH, col, align) {
    var u = pl.u
    c.save(); c.shadowColor = A(col, 0.6); c.shadowBlur = 24 * u
    var F = fit(toks(text), maxW, maxH, Math.min(maxH, 84 * u), 24 * u, 900, FD, 1.05)
    paint(F, x, y + (maxH - F.h) / 2, align, col, pl.cfg.palette)
    c.restore()
  }
  function explainer(pl, R, bt) {
    var st = chapterAt(pl, bt), ch = pl.cfg.chapters[st.i], u = pl.u, acc = colOf(pl.cfg.palette, ch.accent, pl.cfg.palette.a), SP = pl.speed
    var qa = st.qd * SP, lead = st.i === 0 && !qa ? 0.7 : 0 // the first scene starts already in (frame 0 is the cover), unless a question comes first
    var lt = st.pre ? 0.7 : st.a - qa + lead, enters = !st.pre && (st.i > 0 || qa > 0)
    var x = enters ? ease(prog(st.a, qa + 0.1, qa + 0.45)) : 1, out = st.i > 0 && !st.pre ? ease(prog(st.a, 0, 0.22)) : 1
    var sq, sx, sy, bigR = null
    if (pl.L.wide) {
      sq = Math.min(R.h, R.w * 0.5); sx = R.x + (ch.big ? R.w * 0.27 - sq / 2 : R.w / 2 - sq / 2); sy = R.y + (R.h - sq) / 2
      if (ch.big) bigR = { x: R.x + R.w * 0.55, y: R.y + R.h * 0.25, w: R.w * 0.43, h: R.h * 0.5, align: 'left' }
    } else {
      var bh = ch.big ? R.h * 0.2 : 0
      sq = Math.min(R.w, R.h - bh); sx = R.x + (R.w - sq) / 2; sy = R.y + bh + (R.h - bh - sq) / 2
      if (ch.big) bigR = { x: R.x + R.w / 2, y: R.y, w: R.w, h: bh, align: 'center' }
    }
    glow(sx + sq / 2, sy + sq / 2, sq * 0.6, acc, 0.1)
    if (out < 1) { var pi = st.i - 1, ps = pl.chSegs[pi], pd = (ps.dur - ps.qd) * SP; sceneBox(pl, pi, pd + st.a + (pi === 0 && !ps.qd ? 0.7 : 0), pd, sx + sq * 0.03 * out, sy - 30 * u * out, sq * (1 - 0.06 * out), 1 - out) }
    qCard(pl, R, ch.q, st.pre ? 0 : qAlpha(st.a, qa), acc)
    var sc = 0.94 + 0.06 * x
    sceneBox(pl, st.i, lt, (st.dur - st.qd) * SP, sx + sq * (1 - sc) / 2, sy + sq * (1 - sc) / 2 + 30 * u * (1 - x), sq * sc, x)
    if (bigR) withKin(kin(st.pre ? 0.6 : st.a - qa, 0.15, 18 * u), function () { bigText(pl, ch.big, bigR.x, bigR.y, bigR.w, bigR.h, acc, bigR.align) })
  }
  function list(pl, R, bt) {
    var cfg = pl.cfg, u = pl.u, pa = cfg.palette, chs = cfg.chapters, n = chs.length, st = chapterAt(pl, bt)
    var gap = 10 * u, rowH = Math.min((R.h - gap * (n - 1)) / n, 96 * u), y0 = R.y + (R.h - (rowH * n + gap * (n - 1))) / 2
    chs.forEach(function (ch, k) {
      var seg = pl.chSegs[k], y = y0 + k * (rowH + gap), acc = colOf(pa, ch.accent, pa.a)
      // the step ticks once its answer starts (after the question, if any); animation clock = real time × speed
      var SP = pl.speed, at0 = (seg.qd + Math.min(0.8 / SP, (seg.dur - seg.qd) * 0.5)) * SP, active = !st.pre && st.i === k && bt < pl.bodyEnd, tick = easeOut(prog((bt - seg.start) * SP, at0, at0 + 0.35))
      var k2 = kin((bt - pl.bodyStart) * SP + 0.6, k * 0.08, 20 * u), future = bt < seg.start
      withKin(k2, function () {
        c.save(); c.globalAlpha *= future ? 0.38 : 1
        if (active) { c.save(); c.shadowColor = A(acc, 0.45); c.shadowBlur = 26 * u; box({ x: R.x, y: y, w: R.w, h: rowH }, 16 * u, 'rgba(15,23,42,0.95)'); c.restore() }
        box({ x: R.x, y: y, w: R.w, h: rowH }, 16 * u, 'rgba(15,23,42,0.88)', active ? A(acc, 0.8) : 'rgba(51,65,85,0.6)', (active ? 1.8 : 1) * u)
        var cs = Math.min(rowH * 0.62, 50 * u), cx = R.x + 16 * u + cs / 2, cy = y + rowH / 2
        circ(cx, cy, cs / 2); fill(tick > 0 ? acc : 'rgba(30,41,59,0.95)'); stroke(tick > 0 ? acc : '#475569', 2 * u)
        if (tick > 0) { c.save(); c.translate(cx, cy); c.scale(cs / 60, cs / 60); poly([[-14, 1], [-4, 11], [15, -11]], tick, '#020617', 7); c.restore(); if (tick < 1) glow(cx, cy, cs * 1.4, acc, 0.5 * (1 - tick)) }
        else shrinkLine(ch.big || String(k + 1), 800, cs * 0.46, FM, cx, cy, cs * 0.8, '#e2e8f0', 'center')
        var tx = R.x + 32 * u + cs, tw = R.x + R.w - 16 * u - tx
        var F = fit(toks(ch.caption || ch.title || plain(ch.html)), tw, rowH - 16 * u, Math.min(19 * u, rowH * 0.36), 10 * u, 700, FD, 1.18)
        paint(F, tx, cy - F.h / 2, 'left', tick >= 1 && !active ? '#cbd5e1' : '#ffffff', pa)
        c.restore()
      })
    })
  }
  /** "+300%" → {pre:'+', v:300, dec:0, post:'%'}; null when there is no number. */
  function parseBig(s) {
    var m = String(s || '').match(/^(.*?)(\d[\d.,]*)(.*)$/)
    if (!m) return null
    var d = m[2], dec = 0, v
    if (d.indexOf(',') >= 0) { dec = d.length - d.lastIndexOf(',') - 1; v = parseFloat(d.replace(/\./g, '').replace(',', '.')) } else if (/\.\d{3}(\.|$)/.test(d)) v = parseFloat(d.replace(/\./g, '')); else { dec = d.indexOf('.') >= 0 ? d.length - d.indexOf('.') - 1 : 0; v = parseFloat(d) }
    return isFinite(v) ? { pre: m[1], v: v, dec: Math.min(dec, 3), post: m[3] } : null
  }
  function stat(pl, R, bt, now) {
    var st = chapterAt(pl, bt), ch = pl.cfg.chapters[st.i], u = pl.u, pa = pl.cfg.palette, acc = colOf(pa, ch.accent, pa.a)
    var qa = st.pre ? 0 : st.qd * pl.speed, lt = st.pre ? 0 : st.a - qa, ringH = R.h * 0.68, r = Math.min(R.w * 0.42, ringH * 0.44), cx = R.x + R.w / 2, cy = R.y + ringH / 2
    qCard(pl, R, ch.q, qAlpha(st.a, qa), acc)
    c.save(); if (qa) c.globalAlpha *= ease(prog(lt, -0.1, 0.25)) // the ring and the figure are the answer: they come after the question
    glow(cx, cy, r * 1.6, acc, 0.16)
    circ(cx, cy, r); stroke('rgba(30,41,59,0.9)', 10 * u)
    var sw = easeOut(prog(lt, 0.1, 1.5))
    if (sw > 0) { c.save(); c.shadowColor = A(acc, 0.8); c.shadowBlur = 18 * u; c.beginPath(); c.arc(cx, cy, r, -PI / 2, -PI / 2 + 2 * PI * sw); stroke(acc, 10 * u, 'round'); c.restore() }
    c.save(); c.translate(cx, cy); c.rotate(now * 0.35); c.setLineDash([3 * u, 14 * u]); circ(0, 0, r * 1.16); stroke(A(acc, 0.35), 2 * u); c.restore(); c.setLineDash([])
    var b = parseBig(ch.big), shown = ch.big || String(st.i + 1)
    if (b) { var e = easeOut(prog(lt, 0.2, 1.4)); shown = b.pre + nf(b.v * e, b.dec) + b.post }
    var k = kin(lt, 0.05, 16 * u)
    withKin(k, function () { bigText(pl, shown, cx, cy - r * 0.42, r * 1.6, r * 0.84, '#ffffff', 'center') })
    withKin(kin(lt, 0.35, 18 * u), function () {
      var F = fit(toks(ch.caption || ch.title), R.w * 0.92, R.h - ringH - 6 * u, 24 * u, 12 * u, 800, FD, 1.18)
      paint(F, cx, R.y + ringH + (R.h - ringH - F.h) / 2, 'center', acc, pa)
    })
    c.restore()
    var n = pl.cfg.chapters.length
    for (var i = 0; i < n; i++) { circ(cx + (i - (n - 1) / 2) * 16 * u, R.y + ringH - 4 * u, (i === st.i ? 4 : 2.6) * u); fill(i === st.i ? acc : '#334155') }
  }
  function news(pl, R, bt, now) {
    var cfg = pl.cfg, st = chapterAt(pl, bt), ch = cfg.chapters[st.i], u = pl.u, pa = cfg.palette, acc = colOf(pa, ch.accent, pa.a), red = '#F43F5E'
    var lt = st.a, qa = st.pre ? 0 : st.qd * pl.speed, p = 18 * u
    panelBox(R, u)
    // breaking strip and headline
    setF(800, 12 * u, FM); var bw = c.measureText('ULTIM’ORA').width + 30 * u
    rr(R.x + p, R.y + p, bw, 26 * u, 7 * u); fill(red)
    circ(R.x + p + 10 * u, R.y + p + 13 * u, 3.5 * u); fill(A('#ffffff', 0.55 + 0.45 * sin(now * 5)))
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('ULTIM’ORA', R.x + p + 19 * u, R.y + p + 13.5 * u)
    var hF = fit(toks(cfg.headerSubtitle || cfg.intro.title), R.w - 2 * p, R.h * 0.2, 26 * u, 14 * u, 800, FD, 1.15)
    paint(hF, R.x + p, R.y + p + 38 * u, 'left', '#ffffff', pa)
    var tickH = 34 * u, cardY = R.y + p + 38 * u + hF.h + 14 * u, cardH = R.y + R.h - tickH - 14 * u - cardY
    // fact card
    withKin(kin(lt, 0, 22 * u), function () {
      var C = { x: R.x + p, y: cardY, w: R.w - 2 * p, h: cardH }
      box(C, 14 * u, 'rgba(15,23,42,0.92)', A(acc, 0.6), 1.4 * u)
      c.fillStyle = acc; c.fillRect(C.x, C.y + 14 * u, 4 * u, C.h - 28 * u)
      var iy = C.y + 16 * u, ih = C.h - 32 * u
      if (ch.q) { var qF = fit(toks(ch.q), C.w - 44 * u, ih * 0.3, 20 * u, 11 * u, 'italic 600', FD, 1.15); paint(qF, C.x + 22 * u, iy, 'left', '#94a3b8', pa); iy += qF.h + 8 * u; ih -= qF.h + 8 * u }
      withKin(kin(lt, qa, 14 * u), function () { // the answer, after the question
        if (ch.big) { var bh = Math.min(ih * 0.42, 80 * u); bigText(pl, ch.big, C.x + 22 * u, iy, C.w - 40 * u, bh, acc, 'left'); iy += bh + 6 * u; ih -= bh + 6 * u }
        var F = fit(toks(ch.title || ch.caption || plain(ch.html)), C.w - 44 * u, ih, 24 * u, 12 * u, 800, FD, 1.18)
        paint(F, C.x + 22 * u, iy + (ih - F.h) / 2, 'left', '#ffffff', pa)
      })
    })
    // ticker tape
    var T = { x: R.x, y: R.y + R.h - tickH, w: R.w, h: tickH }
    c.save(); rr(T.x, T.y, T.w, T.h, [0, 0, 16 * u, 16 * u]); c.clip(); c.fillStyle = 'rgba(15,23,42,0.98)'; c.fillRect(T.x, T.y, T.w, T.h)
    c.fillStyle = A(red, 0.9); c.fillRect(T.x, T.y, T.w, 2 * u)
    var tape = cfg.chapters.map(function (x) { return x.pill }).join('   •   ') + '   •   '
    setF(700, 12 * u, FM); var tw = c.measureText(tape).width, off = (now * 70 * u) % Math.max(1, tw)
    c.fillStyle = '#cbd5e1'; c.textAlign = 'left'; c.textBaseline = 'middle'
    for (var x = T.x - off; x < T.x + T.w; x += tw) c.fillText(tape, x, T.y + T.h / 2 + u)
    c.restore()
  }
  /** The body (visual + live commentary) at body time bt. */
  function body(pl, bt, now) {
    var L = pl.L, m = pl.mode
    if (DATA[m]) { var ip = interp(pl.cfg, fidx(pl, bt)); kpiRow(pl, L.kpi, ip); lineChart(pl, L.chart, ip, now) } else if (m === 'ranking') ranking(pl, L.vis, bt, now)
    else if (m === 'list') list(pl, L.vis, bt)
    else if (m === 'stat') stat(pl, L.vis, bt, now)
    else if (m === 'news') news(pl, L.vis, bt, now)
    else explainer(pl, L.vis, bt)
    banner(pl, L.banner, bt)
  }

  /* ---------- overlays: hook, freeze, provocation, CTA ---------- */
  function verdict(pl) {
    var cfg = pl.cfg, un = cfg.unit
    if (cfg.mode === 'race') { var l = cfg.data[cfg.data.length - 1]; return [{ t: cfg.series.a.ticker + ' ' + fmtV(un, l.a), col: 'a', bold: 1 }, { t: '•', col: 'dim' }, { t: cfg.series.b.ticker + ' ' + fmtV(un, l.b), col: 'b', bold: 1 }] }
    if (cfg.mode === 'growth') { var g = cfg.data[cfg.data.length - 1]; return [{ t: cfg.series.a.name + ' ' + fmtV(un, g.a), col: 'a', bold: 1 }, { t: '•', col: 'dim' }, { t: g.fullDate, col: '' }] }
    if (cfg.mode === 'ranking') { var it = cfg.items.reduce(function (b, x) { return (un.higherIsBetter ? x.value > b.value : x.value < b.value) ? x : b }); return [{ t: '★ ' + it.name + ' ' + fmtV(un, it.value), col: 'gold', bold: 1 }] }
    return [{ t: cfg.sector || cfg.intro.title, col: '', bold: 1 }]
  }
  function verdictPill(pl, cx, cy, size) {
    var pa = pl.cfg.palette, parts = verdict(pl), sp = size * 0.7, w = 0
    parts.forEach(function (p) { setF(p.bold ? 800 : 600, size, FM); p.w = c.measureText(p.t).width; w += p.w + sp })
    w += size * 1.6 - sp
    var scale = Math.min(1, (pl.W - 2 * pl.L.pad) / w)
    c.save(); c.translate(cx, cy); c.scale(scale, scale)
    rr(-w / 2, -size * 1.2, w, size * 2.4, size * 1.2); fill('rgba(15,23,42,0.92)'); stroke('rgba(51,65,85,0.8)', Math.max(1, size * 0.08))
    var x = -w / 2 + size * 0.8
    parts.forEach(function (p) { setF(p.bold ? 800 : 600, size, FM); c.fillStyle = p.col === 'dim' ? '#475569' : colOf(pa, p.col, '#e2e8f0'); c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(p.t, x, 0.5); x += p.w + sp })
    c.restore()
  }
  function introOverlay(pl, lt, dur, now) {
    var L = pl.L, u = pl.u, cfg = pl.cfg, pa = cfg.palette, I = cfg.intro, W = pl.W
    var fade = 1 - ease(prog(lt, dur - 0.45, dur))
    if (fade <= 0) return
    c.save(); c.globalAlpha *= fade
    c.fillStyle = 'rgba(5,8,17,0.93)'; c.fillRect(0, L.y0 - 8 * u, W, pl.H - L.y0 + 8 * u)
    var maxW = Math.min(W - 2 * L.pad, (L.wide ? 760 : 600) * u), cx = W / 2
    var tF = fit(toks(I.title), maxW, (L.wide ? 2 : 3) * 60 * u * 1.06, (L.wide ? 60 : 46) * u, 22 * u, 800, FD, 1.06)
    var sF = I.subtitle ? fit(toks(I.subtitle), maxW, 2 * 24 * u * 1.15, 24 * u, 12 * u, 800, FD, 1.15) : null
    var dF = I.description ? fit(toks(I.description), Math.min(maxW, 560 * u), 3 * 16 * u * 1.45, (L.tall ? 17 : 16) * u, 10 * u, 500, FD, 1.45) : null
    var tagH = 24 * u, btnH = 54 * u, h = tagH + 18 * u + tF.h + (sF ? 8 * u + sF.h : 0) + (dF ? 14 * u + dF.h : 0) + 30 * u + btnH
    var y = clampN((L.y0 + L.y1) / 2 - h / 2, L.y0, L.y1 - h)
    withKin(kin(lt, 0, 14 * u), function () {
      setF(700, 11 * u, FM); var tw = c.measureText(I.tag).width + 36 * u
      rr(cx - tw / 2, y, tw, tagH, tagH / 2); fill('#0f172a'); stroke('#334155', u)
      circ(cx - tw / 2 + 14 * u, y + tagH / 2, 4 * u); fill(A(pa.a, 0.55 + 0.45 * sin(now * 4)))
      c.fillStyle = '#e2e8f0'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(I.tag, cx - tw / 2 + 24 * u, y + tagH / 2 + 0.5)
    })
    y += tagH + 18 * u
    withKin(kin(lt, 0.12, 18 * u), function () { paint(tF, cx, y, 'center', '#ffffff', pa) })
    y += tF.h
    if (sF) { y += 8 * u; var gy = y; withKin(kin(lt, 0.28, 16 * u), function () { paint(sF, cx, gy, 'center', grad(pa.a, pa.b, cx - sF.w / 2, 0, sF.w, 0), pa) }); y += sF.h }
    if (dF) { y += 14 * u; var dy = y; withKin(kin(lt, 0.42, 14 * u), function () { paint(dF, cx, dy, 'center', '#cbd5e1', pa) }); y += dF.h }
    y += 30 * u
    var by = y
    withKin(kin(lt, 0.6, 14 * u), function () {
      setF(800, 18 * u, FD); var bw = c.measureText(I.playLabel).width + 84 * u, x0 = cx - bw / 2
      var ph = frac(now / 2)
      if (ph < 0.7) { var e = ph / 0.7; rr(x0 - 6 * u - bw * 0.11 * e, by - 6 * u - btnH * 0.11 * e, bw + 12 * u + bw * 0.22 * e, btnH + 12 * u + btnH * 0.22 * e, btnH); stroke(A(pa.a, 0.7 * (1 - e)), 2 * u) }
      c.save(); c.shadowColor = A(pa.a, 0.45); c.shadowBlur = 30 * u
      rr(x0, by, bw, btnH, btnH / 2); fill(grad(pa.a, pa.b, x0, by, bw, btnH)); c.restore()
      path([[x0 + 30 * u, by + btnH / 2 - 9 * u], [x0 + 30 * u, by + btnH / 2 + 9 * u], [x0 + 45 * u, by + btnH / 2]], true); fill('#020617')
      c.fillStyle = '#020617'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(I.playLabel, x0 + 56 * u, by + btnH / 2 + 0.5)
    })
    c.restore()
  }
  function provOverlay(pl, lt, dur) {
    var L = pl.L, u = pl.u, pa = pl.cfg.palette, P0 = pl.cfg.provocation, cx = pl.W / 2
    var maxW = Math.min(pl.W - 2 * L.pad, (L.wide ? 860 : 620) * u)
    var a1 = easeOut(prog(lt, dur * 0.04, dur * 0.04 + 0.7)), a2 = easeOut(prog(lt, dur * 0.34, dur * 0.34 + 0.7))
    var room = L.y1 - L.y0 - 90 * u
    var f1 = fit(rich(P0.line1), maxW, room * 0.42, (L.wide ? 48 : 36) * u, 16 * u, 700, FD, 1.18)
    var f2 = fit(rich(P0.line2), maxW, room * 0.58, (L.wide ? 40 : 32) * u, 14 * u, 700, FD, 1.25)
    var h = 34 * u + 26 * u + f1.h + 26 * u + f2.h, y = (L.y0 + L.y1) / 2 - h / 2
    withKin(kin(lt, 0, 10 * u), function () { verdictPill(pl, cx, y + 17 * u, 12 * u) })
    y += 34 * u + 26 * u
    var y1 = y
    withKin({ a: a1, dy: (1 - a1) * 16 * u }, function () { paint(f1, cx, y1, 'center', '#e2e8f0', pa) })
    y += f1.h + 26 * u
    var y2 = y
    withKin({ a: a2, dy: (1 - a2) * 24 * u }, function () { paint(f2, cx, y2, 'center', '#ffffff', pa) })
  }
  function ctaOverlay(pl, lt, now) {
    var L = pl.L, u = pl.u, cfg = pl.cfg, pa = cfg.palette, T = cfg.cta
    var cardW = L.wide ? Math.min(pl.W - 2 * L.pad, 780 * u) : pl.W - 2 * L.pad, ip = (L.tall ? 22 : 26) * u, inW = cardW - 2 * ip
    var cols = L.tall ? 1 : 2, fg = 10 * u, fw = (inW - (cols - 1) * fg) / cols, fh = (L.tall ? 62 : 58) * u, rows = 4 / cols
    var sF = T.subtitle ? fit(toks(T.subtitle), inW, 2 * 15 * u * 1.35, 15 * u, 10 * u, 500, FD, 1.35) : null
    var badgeH = 28 * u, brandH = 46 * u, btnH = 50 * u
    var h = ip + badgeH + 14 * u + brandH + (sF ? 10 * u + sF.h : 0) + 20 * u + rows * fh + (rows - 1) * fg + 24 * u + btnH + (cfg.brand.bonusText ? 30 * u : 0) + ip
    var sc = Math.min(1, (L.y1 - L.y0) / h)
    var x0 = (pl.W - cardW) / 2, y0 = (L.y0 + L.y1) / 2 - h / 2
    var kc = kin(lt, 0, 20 * u)
    c.save(); c.translate(pl.W / 2, (L.y0 + L.y1) / 2); c.scale(sc, sc); c.translate(-pl.W / 2, -(L.y0 + L.y1) / 2)
    withKin(kc, function () {
      c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 60 * u; c.shadowOffsetY = 24 * u
      rr(x0, y0, cardW, h, 24 * u); fill(grad('rgba(15,23,42,0.97)', 'rgba(6,10,23,0.98)', 0, y0, 0, h)); c.restore()
      rr(x0, y0, cardW, h, 24 * u); stroke('rgba(51,65,85,0.8)', 1.2 * u)
      glow(x0 + cardW / 2, y0, cardW * 0.6, pa.a, 0.1)
      var y = y0 + ip, cx = pl.W / 2
      withKin(kin(lt, 0.1, 10 * u), function () {
        setF(700, 12 * u, FD); var bw = Math.min(c.measureText(T.badge).width + 28 * u, inW)
        rr(cx - bw / 2, y, bw, badgeH, badgeH / 2); fill(A(pa.b, 0.15)); stroke(A(pa.b, 0.4), u)
        line(T.badge, cx, y + badgeH / 2 + 0.5, bw - 24 * u, mix(pa.b, '#ffffff', 0.35), 'center')
      })
      y += badgeH + 14 * u
      var by = y
      withKin(kin(lt, 0.2, 12 * u), function () {
        setF(800, 38 * u, FD); var nw = Math.min(c.measureText(cfg.brand.name).width, inW - 54 * u), lw = 40 * u + 12 * u + nw
        logoBox(cx - lw / 2, by + (brandH - 40 * u) / 2, 40 * u, pa)
        shrinkLine(cfg.brand.name, 800, 38 * u, FD, cx - lw / 2 + 52 * u, by + brandH / 2, inW - 54 * u, '#ffffff')
      })
      y += brandH
      if (sF) { y += 10 * u; var sy = y; withKin(kin(lt, 0.3, 10 * u), function () { paint(sF, cx, sy, 'center', '#cbd5e1', pa) }); y += sF.h }
      y += 20 * u
      T.features.forEach(function (f, k) {
        var col = k % cols, row = Math.floor(k / cols), fx = x0 + ip + col * (fw + fg), fy = y + row * (fh + fg), acc = k % 2 ? pa.b : pa.a
        withKin(kin(lt, 0.4 + 0.1 * k, 14 * u), function () {
          box({ x: fx, y: fy, w: fw, h: fh }, 14 * u, 'rgba(2,6,23,0.75)', '#1e293b', u)
          var is = 32 * u, ix = fx + 12 * u, iy = fy + (fh - is) / 2
          rr(ix, iy, is, is, 9 * u); fill(A(acc, 0.16)); stroke(A(acc, 0.35), u)
          c.save(); c.translate(ix + is / 2 - 8 * u, iy + is / 2 - 8 * u); c.scale(16 * u / 24, 16 * u / 24)
          path([[13, 10], [13, 3], [4, 14], [11, 14], [11, 21], [20, 10]], true); stroke(acc, 2.2, 'round', 'round'); c.restore()
          var tx = ix + is + 12 * u, tw = fx + fw - 12 * u - tx
          setF(700, 14 * u, FD); line(f.title, tx, fy + fh * 0.33, tw, '#ffffff')
          var dF = fit(toks(f.desc), tw, fh * 0.45, 11.5 * u, 8 * u, 500, FD, 1.2)
          paint(dF, tx, fy + fh * 0.5, 'left', '#94a3b8', pa)
        })
      })
      y += rows * fh + (rows - 1) * fg + 24 * u
      var yb = y
      withKin(kin(lt, 0.9, 12 * u), function () {
        setF(800, 17 * u, FD); var bw = Math.min(c.measureText(T.button).width + 70 * u, inW), bx = cx - bw / 2
        var ph = frac(now / 1.6)
        if (ph < 0.7) { var e = ph / 0.7; rr(bx - bw * 0.06 * e, yb - btnH * 0.12 * e, bw * (1 + 0.12 * e), btnH * (1 + 0.24 * e), btnH); stroke(A(pa.b, 0.7 * (1 - e)), 2 * u) }
        c.save(); c.shadowColor = A(pa.b, 0.45); c.shadowBlur = 26 * u; rr(bx, yb, bw, btnH, btnH / 2); fill(grad(pa.a, pa.b, bx, yb, bw, btnH)); c.restore()
        line(T.button, cx, yb + btnH / 2 + 0.5, bw - 30 * u, '#020617', 'center')
        if (cfg.brand.bonusText) { setF(700, 11.5 * u, FM); line(cfg.brand.bonusText, cx, yb + btnH + 18 * u, inW, mix(pa.b, '#ffffff', 0.3), 'center') }
      })
    })
    c.restore()
  }

  /* ---------- blur of the frozen body (provocation + CTA), drawn small and scaled up: no ctx.filter needed ---------- */
  var off = null, offKey = null
  function blurred(pl, bt, alpha) {
    var k = 0.1, w = Math.max(8, Math.round(pl.W * k)), h = Math.max(8, Math.round(pl.H * k))
    if (off === null) { try { off = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : typeof document !== 'undefined' ? document.createElement('canvas') : false } catch (e) { off = false } }
    var oc = off && off.getContext && off.getContext('2d')
    if (oc) {
      var key = pl.total + '|' + pl.W + '|' + bt
      if (offKey !== key || off.__pl !== pl) {
        if (off.width !== w) off.width = w
        if (off.height !== h) off.height = h
        var main = c, mainP = P
        c = oc; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h); c.setTransform(k, 0, 0, k, 0, 0)
        try { body(pl, bt, pl.bodyEnd) } finally { c = main; P = mainP }
        offKey = key; off.__pl = pl
      }
      c.save(); c.globalAlpha *= alpha; c.imageSmoothingEnabled = true; if ('imageSmoothingQuality' in c) c.imageSmoothingQuality = 'high'
      if ('filter' in c) c.filter = 'blur(' + Math.round(4 * pl.u) + 'px)'
      c.translate(pl.W / 2, pl.H / 2); c.scale(0.985, 0.985); c.translate(-pl.W / 2, -pl.H / 2)
      c.drawImage(off, 0, 0, pl.W, pl.H); c.restore()
    }
    c.fillStyle = A(BG, 0.62 * alpha); c.fillRect(0, 0, pl.W, pl.H)
  }

  /* ---------- one frame ---------- */
  /** Draws the frame at time t (seconds) on a canvas of any size with the format's aspect ratio. */
  function draw(ctx, pl, t) {
    c = ctx; P = pl.P; BRAND = { name: pl.cfg.brand.name, logo: null }
    t = clampN(+t || 0, 0, pl.total)
    var loc = locate(pl, t), seg = loc.seg, SP = pl.speed || 1, lt = loc.lt * SP, sd = seg.dur * SP, kind = seg.kind // lt, sd: animation clock (×speed)
    c.save(); c.setTransform(ctx.canvas.width / pl.W, 0, 0, ctx.canvas.height / pl.H, 0, 0)
    try {
      backdrop(pl, t)
      var late = kind === 'provocation' || kind === 'cta', bt = late || kind === 'freeze' ? pl.bodyEnd : t
      var blurK = kind === 'provocation' ? ease(prog(lt, 0, 0.7)) : kind === 'cta' ? 1 : 0
      if (blurK < 1) {
        c.save()
        if (kind === 'freeze') { var z = 1 + 0.02 * ease(prog(lt, 0, sd)), V = pl.L.vis; c.translate(V.x + V.w / 2, V.y + V.h / 2); c.scale(z, z); c.translate(-(V.x + V.w / 2), -(V.y + V.h / 2)) }
        try { body(pl, bt, late ? pl.bodyEnd : t) } finally { c.restore() }
      }
      if (blurK > 0) blurred(pl, bt, blurK)
      if (kind === 'intro') introOverlay(pl, lt + 0.5, sd + 0.5, t) // starts half entered: frame 0 is the cover the apps show in the grid
      if (kind === 'freeze') {
        c.fillStyle = A('#ffffff', 0.28 * (1 - ease(prog(lt, 0, 0.35)))); c.fillRect(0, 0, pl.W, pl.H)
        var C = DATA[pl.mode] ? pl.L.chart : pl.L.vis // the verdict stamps the middle of the frozen chart, clear of the KPI cards
        if (DATA[pl.mode] || pl.mode === 'ranking') withKin(kin(lt, 0.15, 10 * pl.u), function () { verdictPill(pl, pl.W / 2, C.y + C.h * 0.5, 15 * pl.u) })
      }
      if (kind === 'provocation') provOverlay(pl, lt, sd)
      if (kind === 'cta') ctaOverlay(pl, lt, t)
      header(pl, t)
      timeline(pl, t)
      disclaimer(pl)
    } finally { c.restore() }
  }

  /* ---------- zero-token fallback: a reel's script (beats) → explainer config ---------- */
  function isQuestion(s) { return /\?["»”’]?\s*$/.test(String(s || '')) } // only a final "?": "Chi…", "Come…" open plenty of Italian statements
  function fromBeats(o) {
    o = obj(o)
    var name = str(obj(o.brand).name, 28) || 'Yourv€$t'
    var bs = arr(o.beats).map(obj).filter(function (b) { return str(b.text) })
    if (!bs.length) bs = [{ text: str(o.title) || 'Il nostro video' }]
    var hook = bs.length > 2 ? bs[0] : null, last = bs[bs.length - 1]
    var ctaB = bs.length > 2 && /link|scarica|prova|iscriv|segui|bio|scopri|yourv/i.test(str(last.text)) ? last : null
    var mid = bs.slice(hook ? 1 : 0, ctaB ? bs.length - 1 : bs.length), prev = null, chapters = []
    for (var i = 0; i < mid.length; i++) {
      // a question beat followed by a statement: the question is the chapter's q, the next beat its answer (scene and figure from the answer)
      var b = mid[i], q = '', text = str(b.text)
      if (isQuestion(text) && mid[i + 1] && !isQuestion(str(mid[i + 1].text))) { q = text; b = mid[++i]; text = str(b.text) }
      var scene = META[b.scene] && b.scene !== 'domanda' ? b.scene : guess(text, '', prev), big = numberIn(text)
      prev = scene
      var ch = { accent: chapters.length % 2 ? 'b' : 'a', pill: COUNTER.explainer + ' ' + (chapters.length + 1), title: str(b.screen, 70), html: esc(text), speech: (q ? q + ' ' : '') + text, scene: scene }
      if (q) ch.q = q
      if (big) ch.big = big
      chapters.push(ch)
    }
    var title = str(o.title, 48)
    return validate({
      format: o.format, mode: 'explainer', brand: { name: name }, headerSubtitle: str(o.title, 90),
      intro: { tag: name.toUpperCase() + ' • SPIEGONE', title: title || (hook ? str(hook.screen, 48) || cut(str(hook.text), 48) : name), subtitle: hook && str(hook.screen) !== title ? str(hook.screen, 44) : '', description: hook ? str(hook.text, 170) : '', speech: hook ? str(hook.text) : '' },
      chapters: chapters,
      cta: ctaB ? { badge: str(ctaB.screen, 60), speech: str(ctaB.text) } : {},
    })
  }

  /* ---------- zero-AI generator: a topic → VIDEO_CONFIG + post draft (built-in knowledge base, real maths, no network) ---------- */
  /* Points: [question, answer title, answer text, scene?, big?]: every chapter asks a short question, then shows and says the answer
     (never "chiediti", "dipende", "verifica tu"). In texts {a:…} {b:…} {g:…} become hl-a / hl-b / hl-gold. '#' in titles = number of points.
     k: keywords (normalized, matched word by word in any order, typo tolerant); a leading '~' halves the weight of a generic word.
     Facts are general and conservative: no advice, no promised returns; figures that are not law are computed examples. */
  var KB = [
    { id: 'distacc', n: 'ETF a distribuzione o ad accumulo', k: ['distribuz', 'accumul', 'dividendi reinvestiti'], m: 'explainer', s: 'ETF • GUIDA BASE', tax: 1,
      v: ['DISTRIBUZIONE vs ACCUMULO', 'STESSO ETF, DUE VERSIONI', 'DIVIDENDI: INCASSI O REINVESTI?'],
      h: ['ETF a distribuzione o ad accumulo: la differenza in 30 secondi.', 'Stesso ETF, due versioni: cambia tutto sui dividendi.', 'I dividendi del tuo ETF: li incassi o lavorano per te?'],
      p: [['Distribuzione o accumulo: cosa cambia?', 'Cambia dove finiscono i dividendi.', 'Stesso indice, due versioni: o {a:li incassi}, o {b:restano nel fondo}.', 'confronto'],
        ['Cosa fa un ETF a distribuzione?', 'Ti versa i dividendi sul conto.', 'A {a:distribuzione} li incassi periodicamente e paghi subito il {g:26%} su ciò che ricevi.', 'distribuzione', '26%'],
        ['E uno ad accumulo?', 'Reinveste i dividendi da solo.', 'Ad {b:accumulo} restano nel fondo: le tasse le paghi {g:solo quando vendi}, sul guadagno.', 'accumulo'],
        ['Perché nel tempo pesa?', 'Per l’interesse composto.', 'Reinvestire significa che {g:i dividendi producono altri rendimenti}, e le tasse arrivano dopo.', 'interesse'],
        ['A cosa serve l’uno e a cosa l’altro?', 'Rendita oggi o crescita domani.', 'La {a:distribuzione} dà un’entrata periodica; l’{b:accumulo} fa crescere il capitale e rimanda le tasse.', 'obiettivo']],
      x: 'Un ETF a distribuzione ti versa i proventi, già tassati; la versione ad accumulo li reinveste e rimanda le tasse alla vendita.',
      r: [['Sai quali dei tuoi ETF {a:distribuiscono}?', 'E quante tasse hai pagato {g:quest’anno} sui proventi?'], ['Incassare fa piacere.', 'Ma sai quanto ti {g:costa} in tasse ogni anno?']],
      t: ['#ETF', '#dividendi', '#investire'] },
    { id: 'ter', n: 'TER e costi dei fondi', k: ['ter', 'spese correnti', 'costo annuo', 'costi etf', 'costi fondo', 'commissioni fondo'], m: 'race', calc: 'ter', s: 'COSTI • ESEMPIO',
      v: ['IL COSTO CHE NON VEDI', 'TER BASSO vs TER ALTO', 'QUANTO TI COSTA DAVVERO?'],
      h: ['Un punto di TER sembra niente. Su vent’anni no.', 'Il TER non lo paghi con un bonifico: lo paghi in rendimento.', 'Stesso mercato, stessi anni: cambia solo il costo.'],
      p: [['Cos’è il TER?', 'Il costo annuo del fondo.', 'È una {a:percentuale} che non arriva come addebito: si sottrae dal rendimento.', 'commissioni'],
        ['Si paga anche quando il mercato scende?', 'Sì, ogni anno.', 'Anche negli anni negativi: {g:ogni anno}, su tutto il capitale.', 'calo'],
        ['Perché il tempo lo moltiplica?', 'Perdi anche il rendimento futuro.', 'Quello che paghi in costi {b:non cresce più}: su vent’anni diventa {g:migliaia di euro}.', 'interesse'],
        ['Quanto costa un ETF rispetto a un fondo attivo?', 'Spesso molto meno.', 'Molti {a:ETF} su indici ampi costano meno dello 0,3% l’anno; tanti {b:fondi attivi} superano l’1,5%.', 'commissioni']],
      r: [['Conosci il TER', 'di {g:ogni fondo} che hai in portafoglio?'], ['Non è il mercato a pesare di più.', 'Sono i {g:costi} che non guardi.']],
      t: ['#TER', '#ETF', '#costi'] },
    { id: 'composto', n: 'interesse composto', k: ['interesse composto', 'compost', 'palla di neve', 'capitalizzazione', 'interessi sugli interessi'], m: 'growth', calc: 'comp', s: 'INTERESSE COMPOSTO • ESEMPIO',
      v: ['L’INTERESSE COMPOSTO', 'LA PALLA DI NEVE', 'IL TEMPO CHE LAVORA'],
      h: ['Perché i primi dieci anni sembrano inutili (e non lo sono).', 'Interesse composto: il guadagno che genera altro guadagno.', 'Il segreto non è quanto metti. È per quanto tempo.'],
      p: [['Cos’è l’interesse composto?', 'Interessi che producono altri interessi.', 'Ogni anno il rendimento si somma al capitale e {g:l’anno dopo rende anche lui}.', 'interesse'],
        ['Perché all’inizio sembra poco?', 'Perché lavora su cifre piccole.', 'Nei primi anni la curva è piatta: conta quasi solo {a:quello che metti}.', 'crescita'],
        ['Quando si vede davvero?', 'Dopo molti anni: la curva si piega.', 'Esempio ipotetico al 5%: {a:10.000 €} diventano circa {b:16.300 €} in 10 anni e {g:43.200 €} in 30.', 'tempo', '× 4,3'],
        ['Funziona anche contro di te?', 'Sì: con costi e debiti.', 'Commissioni e debiti si compongono allo stesso modo: {g:contro di te}.', 'commissioni']],
      r: [['Il tempo non si recupera.', 'Da quanto lo stai lasciando {g:fermo}?'], ['Non serve un colpo di fortuna.', 'Serve {g:tempo}. Lo stai usando?']],
      t: ['#interessecomposto', '#investire', '#lungoperiodo'] },
    { id: 'pac', n: 'PAC, piano di accumulo', k: ['pac', 'piano di accumulo', 'versamenti mensili', 'investire ogni mese', '~al mese'], m: 'growth', calc: 'pac', s: 'PAC • ESEMPIO',
      v: ['IL PAC IN 30 SECONDI', 'POCO, MA OGNI MESE', 'LA FORZA DELLA COSTANZA'],
      h: ['Non hai una grossa cifra da investire? Il PAC nasce per questo.', 'Investire un po’ ogni mese: cosa succede davvero.', 'Il PAC non ti rende ricco in fretta. Ti rende costante.'],
      p: [['Cos’è un PAC?', 'Una cifra fissa investita ogni mese.', 'Investi una {a:cifra fissa} a intervalli regolari, anche piccola.', 'accumulo'],
        ['Cosa succede quando il prezzo scende?', 'Compri più quote.', 'Con la stessa cifra, a prezzo basso compri {b:più quote}: il prezzo medio si livella.', 'calo'],
        ['Serve indovinare il momento giusto?', 'No, decide il calendario.', 'Entri {g:a date fisse}: niente ansia da tempismo.', 'tempo'],
        ['Quanto pesano le commissioni?', 'Tanto, se sono fisse.', 'Esempio: 2 € su un versamento da {a:100 €} sono già il {g:2%} di costo.', 'commissioni', '2%']],
      r: [['Sai quanto stai versando', 'davvero {g:ogni mese}?'], ['La costanza batte il tempismo.', 'Ma solo se {g:non ti fermi}.']],
      t: ['#PAC', '#pianodiaccumulo', '#ETF'] },
    { id: 'inflazione', n: 'inflazione', k: ['inflazion', 'potere d acquisto', 'carovita', 'prezzi salgono', 'soldi fermi', 'conto corrente fermo'], m: 'stat', calc: 'infl', s: 'INFLAZIONE • ESEMPIO',
      v: ['IL LADRO SILENZIOSO', 'SOLDI FERMI, SOLDI CHE CALANO', 'L’INFLAZIONE IN NUMERI'],
      h: ['I soldi fermi sul conto non sono al sicuro: perdono valore.', 'Stesso numero sul conto, meno cose nel carrello.', 'L’inflazione non si vede. Ma si paga.'],
      p: [['Cos’è l’inflazione?', 'L’aumento generale dei prezzi.', 'Con gli stessi soldi {g:compri meno cose}.', 'calo'],
        ['Se il saldo non cambia, cosa perdo?', 'Il potere d’acquisto.', 'Il numero sul conto resta uguale, ma {a:quello che ci compri} scende.', 'tempo'],
        ['Quanto pesa un’inflazione bassa?', 'Un terzo in vent’anni.', 'Esempio ipotetico al 2% annuo: dopo 20 anni {g:10.000 €} comprano come circa {g:6.700 €} di oggi.', 'interesse', '-33%'],
        ['Quindi cosa conta?', 'Il rendimento reale.', 'Quanto rendi {b:al netto dell’inflazione}, non il numero lordo.', 'obiettivo']],
      r: [['Il conto non scende.', 'Ma il tuo potere d’acquisto {g:sì}.'], ['Sai quanto rendono davvero', 'i tuoi soldi {g:al netto dell’inflazione}?']],
      t: ['#inflazione', '#risparmio', '#educazionefinanziaria'] },
    { id: 'diversificazione', n: 'diversificazione', k: ['diversific', 'tutte le uova', 'paniere', 'concentrazion', 'asset allocation', 'allocazion'], m: 'explainer', s: 'PORTAFOGLIO • RISCHIO',
      v: ['NON TUTTE LE UOVA', 'DIVERSIFICARE DAVVERO', 'UN SOLO PANIERE?'],
      h: ['Hai dieci titoli. Sei diversificato? Non è detto.', 'Diversificare non è comprare tanto: è comprare diverso.', 'Tutte le uova nello stesso paniere: il rischio che non vedi.'],
      p: [['Cosa vuol dire diversificare?', 'Mettere i soldi su cose diverse.', 'Su {a:aree}, {b:settori} e strumenti che non si muovono insieme.', 'diversificazione'],
        ['Elimina il rischio?', 'No: riduce quello del singolo titolo.', 'Abbassa il peso del titolo che va male, {g:non il rischio di mercato}.', 'protezione'],
        ['Dieci titoli bastano?', 'Non se sono simili.', 'Dieci aziende dello stesso settore {g:si muovono insieme}: è un rischio solo, dieci volte.', 'errore'],
        ['Due fondi diversi bastano?', 'Non sempre: possono sovrapporsi.', 'Fondi diversi possono contenere {a:gli stessi titoli}: conta il totale, non il numero di fondi.', 'app']],
      r: [['Sai quanto pesa', 'il tuo titolo {g:più grande}?'], ['Pensi di essere diversificato.', 'Ma hai mai visto {g:il totale}?']],
      t: ['#diversificazione', '#portafoglio', '#investire'] },
    { id: 'minusvalenze', n: 'minusvalenze e zainetto fiscale', k: ['minusvalen', 'zainetto fiscale', 'zainetto', 'compensare perdite', 'perdite fiscali', 'plusvalen'], m: 'news', s: 'FISCO • MINUSVALENZE', tax: 1,
      v: ['MINUSVALENZE IN SCADENZA', 'LO ZAINETTO FISCALE', 'LE PERDITE CHE VALGONO'],
      h: ['Le tue perdite possono farti risparmiare tasse. Ma scadono.', 'Zainetto fiscale: le minusvalenze non durano per sempre.', 'Hai perso su un titolo? Quella perdita ha una scadenza.'],
      p: [['Cosa sono le minusvalenze?', 'Perdite realizzate vendendo.', 'Nascono quando vendi {a:sotto il prezzo di carico}.', 'minusvalenze'],
        ['A cosa servono?', 'A pagare meno tasse sui guadagni.', 'Si compensano con {b:redditi diversi}, come i guadagni su azioni e obbligazioni.', 'minusvalenze'],
        ['Quanto durano?', 'Fino al quarto anno successivo.', 'Valgono fino al {g:31 dicembre del quarto anno} dopo quello della perdita.', 'tasse', '4 anni'],
        ['Si compensano con gli ETF?', 'No, con i guadagni degli ETF no.', 'I guadagni da {a:ETF e fondi} sono redditi di capitale: {g:non si compensano}.', 'errore']],
      x: 'Una perdita realizzata nel 2022 si può usare fino al 31 dicembre 2026.',
      r: [['Quante minusvalenze hai', 'che scadono {g:quest’anno}?'], ['Una perdita può valere qualcosa.', 'Solo se {g:la usi in tempo}.']],
      t: ['#minusvalenze', '#fisco', '#zainettofiscale'] },
    { id: 'tassazione', n: 'tasse sugli investimenti', k: ['tassazion', 'tasse investiment', 'aliquota', '26', '12 5', 'capital gain', 'imposta sostitutiva', 'tasse sui guadagni', 'redditi finanziari'], m: 'explainer', s: 'FISCO • ALIQUOTE', tax: 1,
      v: ['26% O 12,5%?', 'LE TASSE SUI GUADAGNI', 'QUANTO TI TOCCA PAGARE'],
      h: ['26% o 12,5%: non tutti i guadagni pagano uguale.', 'Sui tuoi guadagni finanziari quanto paghi davvero?', 'Perché i titoli di Stato pagano meno tasse?'],
      p: [['Quanto si paga sui guadagni finanziari?', 'Di base il 26%.', 'Su gran parte dei redditi finanziari: su 1.000 € di guadagno ne restano {a:740 €}.', 'tasse', '26%'],
        ['C’è un’aliquota più bassa?', 'Sì: il 12,5% sui titoli di Stato.', 'I {b:titoli di Stato} italiani e dei Paesi white list pagano il {g:12,5%}.', 'tasse', '12,5%'],
        ['E i fondi che li contengono?', 'Pagano una via di mezzo.', 'La parte in titoli di Stato paga {a:in proporzione} l’aliquota ridotta.', 'diversificazione'],
        ['Chi le paga, materialmente?', 'Nel regime amministrato, l’intermediario.', 'La banca o il broker italiano {b:trattiene e versa} senza che tu faccia nulla.', 'app']],
      r: [['Sai quanto hai pagato', 'di tasse {g:quest’anno}?'], ['Due aliquote, un portafoglio.', 'Sai quale si applica {g:ai tuoi titoli}?']],
      t: ['#tasse', '#fisco', '#investimenti'] },
    { id: 'dividendi', n: 'dividendi', k: ['dividend', 'rendita passiva', 'reddito passivo', 'stacco cedola'], m: 'explainer', s: 'AZIONI • DIVIDENDI', tax: 1,
      v: ['DIVIDENDI: LA VERITÀ', 'IL DIVIDENDO NON È GRATIS', 'QUANTO TI RESTA DEL DIVIDENDO'],
      h: ['Il dividendo non è un regalo: esce dal valore dell’azione.', 'Incassi un dividendo. Quanto ti resta davvero?', 'Dividendi esteri: perché a volte paghi due volte.'],
      p: [['Da dove arriva il dividendo?', 'Dagli utili dell’azienda.', 'È una parte degli {a:utili} che l’azienda distribuisce ai soci.', 'distribuzione'],
        ['Quindi è un guadagno in più?', 'No: esce dal prezzo.', 'Allo stacco il prezzo dell’azione {g:scende più o meno di quanto paga}.', 'calo'],
        ['Quante tasse ci paghi?', 'Il 26% in Italia.', 'Su 100 € di dividendo italiano ne incassi {a:74 €}.', 'tasse', '26%'],
        ['E quelli esteri?', 'Possono essere tassati due volte.', 'Prima la {b:ritenuta del Paese d’origine}, poi il 26% in Italia: si recupera solo in parte.', 'errore']],
      r: [['Ti piace incassare.', 'Ma sai quanto ti resta {g:dopo le tasse}?'], ['Un dividendo alto', 'non è per forza {g:un buon affare}.']],
      t: ['#dividendi', '#azioni', '#rendita'] },
    { id: 'azobb', n: 'azioni e obbligazioni', k: ['obbligazion', 'bond', 'azionario', 'obbligazionario', 'azioni obbligazioni'], m: 'explainer', s: 'PORTAFOGLIO • BASI',
      v: ['AZIONI vs OBBLIGAZIONI', 'SOCIO O CREDITORE?', 'DUE MESTIERI DIVERSI'],
      h: ['Azioni o obbligazioni: socio o creditore?', 'Azioni e obbligazioni non fanno la stessa cosa nel portafoglio.', 'Più crescita o più stabilità? Ecco la differenza.'],
      p: [['Azioni o obbligazioni: che differenza c’è?', 'Socio o creditore.', 'Con le {a:azioni} sei socio dell’azienda; con le {b:obbligazioni} le presti soldi.', 'confronto'],
        ['Cosa ti danno le azioni?', 'Più potenziale, più oscillazioni.', 'Partecipi a utili e perdite: {a:più crescita possibile}, ma anche {g:cali più forti}.', 'crescita'],
        ['E le obbligazioni?', 'Cedole e rimborso a scadenza.', 'Ricevi {b:cedole} e il capitale indietro a scadenza, se l’emittente paga.', 'distribuzione'],
        ['Le obbligazioni possono perdere?', 'Sì, se i tassi salgono.', 'Il prezzo scende quando {g:i tassi salgono}, e l’emittente può non rimborsare.', 'calo'],
        ['Perché tenerle entrambe?', 'Si compensano.', 'Le {a:azioni} spingono la crescita, le {b:obbligazioni} di solito oscillano meno.', 'diversificazione']],
      r: [['Sai quanto del tuo portafoglio', 'è in {a:azioni} e quanto in {b:obbligazioni}?']],
      t: ['#azioni', '#obbligazioni', '#portafoglio'] },
    { id: 'emergenza', n: 'fondo emergenze', k: ['fondo emergenz', 'emergenz', 'imprevist', 'cuscinetto', 'riserva liquida'], m: 'list', s: 'RISPARMIO • BASI',
      v: ['IL FONDO EMERGENZE', 'PRIMA DI INVESTIRE', 'IL CUSCINETTO CHE SERVE'],
      h: ['Prima di investire un euro, costruisci questo.', 'L’imprevisto arriva sempre. Tu sei pronto?', 'Il fondo emergenze: la base che quasi tutti saltano.'],
      p: [['Da dove si parte?', 'Dalle spese di un mese.', 'Calcola quanto ti serve {a:ogni mese} per vivere davvero.', 'checklist'],
        ['Quanto deve essere grande?', 'Da 3 a 6 mesi di spese.', 'Il riferimento più diffuso: {g:6 mesi} con un reddito variabile, 3 con uno stabile.', 'obiettivo', '3–6'],
        ['Dove si tiene?', 'Su un conto separato.', 'Un conto a parte, {b:disponibile subito}, che non usi per altro.', 'protezione'],
        ['Si può investire?', 'No, non dove può scendere.', 'Deve esserci quando serve: {g:niente azioni né cripto}.', 'errore'],
        ['E se lo usi?', 'Lo ricostruisci per primo.', 'La priorità diventa {a:riportarlo} alla cifra di partenza.', 'tempo']],
      r: [['Se domani arriva una spesa imprevista,', 'da dove {g:prendi i soldi}?']],
      t: ['#fondoemergenza', '#risparmio', '#finanzapersonale'] },
    { id: 'ribilanciamento', n: 'ribilanciamento', k: ['ribilanci', 'riequilibr', 'pesi del portafoglio'], m: 'explainer', s: 'PORTAFOGLIO • MANUTENZIONE',
      v: ['RIBILANCIARE', 'IL PORTAFOGLIO SI SPOSTA', 'TORNARE AL PIANO'],
      h: ['Il tuo portafoglio cambia da solo. Te ne sei accorto?', 'Ribilanciare: la manutenzione che quasi nessuno fa.', 'Avevi deciso 60/40. Oggi cosa hai davvero?'],
      p: [['Perché il portafoglio cambia da solo?', 'Quello che sale pesa di più.', 'Se le azioni salgono, il tuo 60/40 può diventare {a:70/30} senza che tu faccia nulla.', 'diversificazione', '60/40'],
        ['Cosa vuol dire ribilanciare?', 'Tornare ai pesi scelti.', 'Riporti ogni parte all’{b:allocazione che avevi deciso}.', 'obiettivo'],
        ['Quando si fa?', 'A date fisse o oltre una soglia.', 'Per esempio {a:una volta l’anno}, o quando un peso si sposta di {b:5 punti}.', 'tempo'],
        ['Fa pagare tasse?', 'Se vendi in guadagno, sì.', 'Per evitarle si può ribilanciare {g:con i nuovi versamenti} invece di vendere.', 'tasse']],
      r: [['Sai quanto pesa oggi', 'ogni parte del tuo {g:portafoglio}?']],
      t: ['#ribilanciamento', '#assetallocation', '#portafoglio'] },
    { id: 'orizzonte', n: 'orizzonte temporale', k: ['orizzont', 'lungo periodo', 'breve periodo', 'quando mi servono'], m: 'explainer', s: 'PIANIFICAZIONE • TEMPO',
      v: ['L’ORIZZONTE TEMPORALE', 'QUANDO TI SERVONO?', 'IL TEMPO DECIDE'],
      h: ['Prima di cosa comprare, conta quando ti servono i soldi.', 'Lo stesso investimento può essere adatto o no: decide il tempo.', 'Orizzonte temporale: la domanda che viene prima di tutto.'],
      p: [['Cos’è l’orizzonte temporale?', 'Quanto restano investiti i soldi.', 'È {a:il tempo} che passa prima che ti servano davvero.', 'tempo'],
        ['Soldi che servono tra un anno?', 'Niente strumenti che oscillano.', 'Su un orizzonte breve {g:un calo non fa in tempo a recuperare}.', 'protezione'],
        ['E su vent’anni?', 'Più margine per i ribassi.', 'Più tempo vuol dire più spazio per {b:assorbire i cali} e recuperare.', 'crescita'],
        ['Un orizzonte per tutto il portafoglio?', 'No: uno per obiettivo.', 'Casa, pensione, vacanza: {a:ognuno ha il suo} orizzonte e il suo rischio.', 'obiettivo']],
      r: [['Sai già', 'quando ti serviranno {g:quei soldi}?']],
      t: ['#orizzontetemporale', '#investire', '#pianificazione'] },
    { id: 'rischio', n: 'rischio e volatilità', k: ['volatilit', 'rischio', 'oscillazion', 'drawdown', 'profilo di rischio'], m: 'explainer', s: 'RISCHIO • BASI',
      v: ['RISCHIO E VOLATILITÀ', 'QUANTO OSCILLA?', 'IL RISCHIO SI SCEGLIE'],
      h: ['Volatilità e rischio non sono la stessa cosa.', 'Quanto saresti disposto a veder scendere il tuo portafoglio?', 'Il rischio non si elimina. Si sceglie.'],
      p: [['Volatilità e rischio sono la stessa cosa?', 'No: una oscilla, l’altro fa perdere.', 'La {a:volatilità} misura quanto si muovono i prezzi; il {g:rischio} è perdere o mancare l’obiettivo.', 'calo'],
        ['Quanto può scendere un portafoglio azionario?', 'Anche della metà.', 'Tra il 2007 e il 2009 le Borse mondiali hanno perso {g:oltre il 50%} dal picco al minimo.', 'calo', '-50%'],
        ['Più rendimento senza più rischio?', 'No.', 'Un rendimento atteso più alto {g:arriva sempre con più rischio}.', 'obiettivo'],
        ['Allora da cosa dipende il rischio giusto?', 'Da tempo e nervi.', 'Conta {a:quanto tempo hai} e {b:quanto calo reggi} senza vendere.', 'protezione']],
      r: [['Se domani perdessi il 20%,', 'resteresti {g:calmo}?']],
      t: ['#rischio', '#volatilità', '#investire'] },
    { id: 'errori', n: 'errori da evitare quando investi', k: ['errori', 'sbagli', 'evitare', 'errore'], m: 'list', s: 'INVESTIRE • ERRORI',
      v: ['# ERRORI DA EVITARE', 'GLI ERRORI CHE COSTANO', 'NON FARLO'],
      h: ['# errori che fanno perdere soldi a chi investe.', 'L’errore più caro non è scegliere male. È uno di questi.', 'Stai facendo uno di questi # errori?'],
      p: [['Seguire chi è salito di più?', 'Inseguire i rendimenti passati.', 'Chi è salito di più {g:non è detto} che continui a farlo.', 'crescita'],
        ['Guardare solo il rendimento?', 'Ignorare i costi.', 'Un {a:TER dell’1,5%} invece dello 0,2% pesa ogni anno, su tutto il capitale.', 'commissioni'],
        ['Vendere quando tutto crolla?', 'Vendere nel panico.', 'Uscire dopo un crollo {g:rende definitiva la perdita}.', 'calo'],
        ['Puntare tutto su un titolo?', 'Non diversificare.', 'Tutto su un titolo o un settore è {b:una scommessa}, non un piano.', 'diversificazione'],
        ['Non sapere quanto hai?', 'Non avere il quadro completo.', 'Senza una visione d’insieme {a:non vedi rischi né costi}.', 'app'],
        ['Investire i soldi delle emergenze?', 'Investire soldi che ti servono.', 'Senza un {b:fondo emergenze} ogni imprevisto ti costringe a vendere.', 'protezione']],
      r: [['Quanti di questi errori', 'hai fatto {g:quest’anno}?'], ['Non serve essere geniali.', 'Basta {g:non sbagliare} le cose semplici.']],
      t: ['#errori', '#investire', '#educazionefinanziaria'] },
    { id: 'previdenza', n: 'TFR e fondo pensione', k: ['pension', 'tfr', 'previdenz', 'fondo pensione', 'liquidazione'], m: 'explainer', s: 'PREVIDENZA • TFR', tax: 1,
      v: ['TFR E FONDO PENSIONE', 'LA PENSIONE CHE COSTRUISCI', 'IL TFR DOVE VA?'],
      h: ['Il tuo TFR: in azienda o in un fondo pensione?', 'La pensione integrativa ha vantaggi fiscali che pochi conoscono.', 'Sai dove finisce il tuo TFR ogni anno?'],
      p: [['Quanto TFR maturi ogni anno?', 'Circa il 6,91% dello stipendio lordo.', 'Ogni anno si accantona come {a:trattamento di fine rapporto}: di base resta in azienda.', 'accumulo', '6,91%'],
        ['Si può spostare in un fondo pensione?', 'Sì, nella previdenza complementare.', 'Il TFR può andare a un {b:fondo pensione} invece che restare in azienda.', 'obiettivo'],
        ['Che vantaggio c’è in entrata?', 'I contributi abbassano l’IRPEF.', 'Sono {g:deducibili} dal reddito, entro un tetto annuo fissato dalla legge.', 'tasse'],
        ['E in uscita?', 'Paghi dal 15% al 9%.', 'Sulle prestazioni l’aliquota parte dal {a:15%} e scende fino al {g:9%} con gli anni di adesione.', 'tasse', '15% → 9%']],
      r: [['Sai quanto TFR hai maturato', 'e {g:dove sta lavorando}?']],
      t: ['#TFR', '#fondopensione', '#previdenza'] },
    { id: 'contodeposito', n: 'conti deposito', k: ['conto deposito', 'conti deposito', 'deposito vincolato', 'conto remunerato', '~liquidita'], m: 'explainer', s: 'LIQUIDITÀ • CONTI', tax: 1,
      v: ['IL CONTO DEPOSITO', 'LIQUIDITÀ CHE RENDE?', 'VINCOLATO O LIBERO?'],
      h: ['Conto deposito: i quattro numeri da sapere.', 'La liquidità ferma può rendere qualcosa. Ecco quanto resta.', 'Vincolato o libero: la differenza che conta.'],
      p: [['Cos’è un conto deposito?', 'Un conto che paga interessi.', 'La banca ti riconosce {a:interessi} sulla liquidità che lasci lì.', 'accumulo'],
        ['Vincolato o libero?', 'Vincolato rende di più, ma blocca i soldi.', 'Con il {g:vincolo} non prelevi prima della scadenza senza perdere interessi.', 'tempo'],
        ['Quante tasse si pagano?', 'Il 26% sugli interessi, più il bollo.', 'Sugli interessi il {a:26%}, più l’{b:imposta di bollo} dello 0,20% annuo.', 'tasse', '26%'],
        ['E se la banca fallisce?', 'Coperti fino a 100.000 €.', 'Il fondo di tutela dei depositi copre fino a {g:100.000 €} per depositante, per banca.', 'protezione', '100.000 €']],
      r: [['Quanto rende davvero la tua liquidità', '{g:dopo tasse e bollo}?']],
      t: ['#contodeposito', '#liquidità', '#risparmio'] },
    { id: 'cripto', n: 'criptovalute', k: ['cripto', 'crypto', 'bitcoin', 'ethereum', 'blockchain', 'altcoin', 'stablecoin'], m: 'list', s: 'CRIPTO • RISCHI', tax: 1,
      v: ['CRIPTO: I RISCHI VERI', 'PRIMA DI COMPRARE CRIPTO', 'NON È SOLO UN GRAFICO'],
      h: ['Prima di comprare cripto, guarda questi rischi.', 'Cripto: quello che nei video non ti dicono.', 'Sale in fretta. Scende ancora più in fretta.'],
      p: [['Quanto possono scendere?', 'Anche oltre il 70%.', 'Bitcoin ha perso {g:oltre il 70%} dal picco più di una volta.', 'calo', '-70%'],
        ['Se la piattaforma fallisce?', 'Nessuno ti rimborsa.', 'Non c’è un fondo di tutela come per i depositi: {a:i soldi possono sparire}.', 'protezione'],
        ['Chi custodisce le cripto?', 'Chi ha le chiavi.', 'Perdere le {b:chiavi private} vuol dire perdere tutto, senza appello.', 'errore'],
        ['Come si riconosce una truffa?', 'Promesse di guadagno facile.', 'Rendimenti garantiti e guru sui social sono {g:segnali d’allarme}.', 'errore'],
        ['E le tasse?', 'Il 33% sui guadagni, dal 2026.', 'Le plusvalenze vanno {a:dichiarate}: l’aliquota è salita dal 26% al 33%.', 'tasse', '33%']],
      r: [['Sapresti spiegare', 'cosa hai comprato {g:davvero}?']],
      t: ['#cripto', '#bitcoin', '#rischio'] },
    { id: 'dichiarazione', n: 'investimenti e dichiarazione dei redditi', k: ['730', 'dichiarazion', 'quadro rw', 'rw', 'ivafe', 'regime dichiarativo', 'broker estero', 'redditi di capitale'], m: 'explainer', s: 'FISCO • DICHIARAZIONE', tax: 1,
      v: ['INVESTIMENTI E 730', 'BROKER ESTERO E TASSE', 'COSA DICHIARARE'],
      h: ['Hai un broker estero? Le tasse le calcoli tu.', 'Investimenti e dichiarazione: chi fa cosa.', 'Regime amministrato o dichiarativo: cambia chi fa i conti.'],
      p: [['Chi calcola le tasse con una banca italiana?', 'La banca, nel regime amministrato.', 'Fa da {a:sostituto d’imposta}: trattiene e versa lei.', 'app'],
        ['E con un broker estero?', 'Le calcoli e le dichiari tu.', 'Con molti broker esteri sei in {b:regime dichiarativo}: guadagni e dividendi vanno in dichiarazione.', 'tasse'],
        ['Cosa va dichiarato oltre ai guadagni?', 'Le attività all’estero, nel quadro RW.', 'Con l’{g:IVAFE} dello 0,20% sul valore delle attività finanziarie.', 'tasse', 'RW'],
        ['Cosa serve per farlo bene?', 'Lo storico completo.', 'Prezzi di carico, vendite, dividendi: {a:raccolti tutto l’anno}, non a maggio.', 'checklist']],
      r: [['Se domani dovessi compilare la dichiarazione,', 'avresti {g:tutti i numeri}?']],
      t: ['#730', '#dichiarazionedeiredditi', '#fisco'] },
    { id: 'traccia', n: 'tenere traccia del portafoglio', k: ['tenere traccia', 'traccia', 'monitorare', 'tracker', 'piu broker', 'excel', '~portafoglio'], m: 'explainer', s: 'PORTAFOGLIO • CONTROLLO',
      v: ['DOVE SONO I TUOI SOLDI?', 'TANTI BROKER, UN PORTAFOGLIO', 'IL QUADRO COMPLETO'],
      h: ['Tre broker, due app e un Excel: sai quanto hai davvero?', 'Se non lo misuri, non lo gestisci.', 'Quanto rende il tuo portafoglio, tutto insieme?'],
      p: [['Perché è difficile sapere quanto hai?', 'Ogni broker mostra solo il suo pezzo.', 'Conti, broker e fondi sparsi: {g:nessuno ti dà il totale}.', 'diversificazione'],
        ['Cosa serve vedere?', 'Valore, rendimento, costi e tasse insieme.', '{a:Valore}, {b:rendimento}, costi e tasse nello stesso quadro.', 'app'],
        ['Perché il totale conta?', 'Senza totale non vedi rischi e costi.', 'Senza il quadro completo non sai se sei {a:diversificato} né quanto paghi.', 'commissioni'],
        ['E le scadenze?', 'Una data persa costa.', 'Minusvalenze, cedole, dichiarazione: {g:ognuna ha una data}.', 'tasse']],
      r: [['Quanto vale oggi il tuo portafoglio,', '{g:tutto insieme}?']],
      t: ['#portafoglio', '#investimenti', '#finanzapersonale'] },
    { id: 'benchmark', n: 'benchmark', k: ['benchmark', 'indice di riferimento', 'battere il mercato', 'sottoperform', 'gestione attiva', 'fondo attivo'], m: 'explainer', s: 'FONDI • CONFRONTI',
      v: ['IL BENCHMARK', 'BATTE IL MERCATO?', 'CONFRONTA BENE'],
      h: ['Il tuo fondo ha fatto +5%. È tanto o poco?', 'Un rendimento da solo non dice niente. Serve un confronto.', 'Battere il mercato: cosa vuol dire davvero.'],
      p: [['Cos’è un benchmark?', 'L’indice di riferimento del fondo.', 'È il {a:metro} con cui si misura se un fondo ha fatto bene.', 'obiettivo'],
        ['+5% è tanto o poco?', 'Poco, se il suo indice ha fatto +8%.', 'Un fondo azionario globale si misura con {b:un indice globale}: lì +5% vuol dire {g:3 punti in meno}.', 'confronto', '+5% vs +8%'],
        ['Prima o dopo i costi?', 'Dopo, sempre.', 'Conta quanto resta {g:dopo le commissioni}, sullo stesso periodo.', 'commissioni'],
        ['Un anno basta per giudicare?', 'No, servono più anni.', 'Un anno buono può essere fortuna: contano {a:periodi di 5 o 10 anni}.', 'tempo']],
      r: [['Sai se il tuo fondo', 'ha fatto meglio {g:del suo indice}?']],
      t: ['#benchmark', '#fondi', '#ETF'] },
    { id: 'costinascosti', n: 'costi nascosti dei fondi', k: ['costi nascost', 'commissioni nascost', 'commissioni', 'kid', 'commissione di ingresso', 'performance fee'], m: 'list', s: 'FONDI • COSTI',
      v: ['I COSTI NASCOSTI', 'COSA PAGHI SENZA SAPERLO', 'LEGGI IL KID'],
      h: ['Il tuo fondo ti costa più di quanto pensi?', 'I costi che non vedi nell’estratto conto.', 'Dove si nascondono le commissioni.'],
      p: [['Qual è il costo principale?', 'Spese correnti.', 'Il {a:costo annuo} del fondo, tolto dal rendimento ogni anno.', 'commissioni'],
        ['Si paga per entrare o uscire?', 'Ingresso e uscita.', 'Alcuni fondi trattengono {b:qualche punto percentuale} quando entri o esci.', 'commissioni'],
        ['Cos’è la performance fee?', 'Commissione di performance.', 'Il gestore trattiene una quota del guadagno se il fondo {g:supera un obiettivo}.', 'obiettivo'],
        ['E dentro il fondo?', 'Costi di transazione.', 'Comprare e vendere titoli dentro il fondo {a:ha un costo} che si somma.', 'calo'],
        ['Quanto pesano tutti insieme?', 'Il totale nel KID.', 'Il {g:KID} li somma in euro e in percentuale: un solo numero da confrontare.', 'checklist']],
      r: [['Sai quanto ti costano', 'i tuoi fondi {g:ogni anno}?']],
      t: ['#commissioni', '#fondi', '#costi'] },
    { id: 'oro', n: 'oro', k: ['oro', 'metalli preziosi', 'lingott', 'bene rifugio', 'etc'], m: 'explainer', s: 'ORO • BENE RIFUGIO',
      v: ['ORO: BENE RIFUGIO?', 'L’ORO NEL PORTAFOGLIO', 'BRILLA, MA…'],
      h: ['L’oro protegge sempre? Non proprio.', 'Bene rifugio: cosa fa davvero l’oro in portafoglio.', 'Oro: niente dividendi, niente cedole. E allora?'],
      p: [['L’oro paga qualcosa?', 'No: niente dividendi né cedole.', 'Guadagni {g:solo se il prezzo sale}.', 'obiettivo'],
        ['Protegge nelle crisi?', 'Spesso, non sempre.', 'In alcune crisi ha {a:tenuto meglio} delle azioni, ma non è una regola.', 'protezione'],
        ['Può scendere a lungo?', 'Sì, anche per anni.', 'Tra il 2011 e il 2015 il prezzo dell’oro è sceso di {b:oltre il 40%}.', 'calo', '-40%'],
        ['Come si compra?', 'Fisico o con un ETC.', 'Lingotti e monete oppure {a:ETC} in Borsa: costi e tasse cambiano.', 'checklist']],
      r: [['Hai oro in portafoglio', 'perché sai {g:a cosa ti serve}?']],
      t: ['#oro', '#benerifugio', '#investire'] },
    { id: 'ribassi', n: 'mercati che scendono', k: ['crollo', 'crolla', 'ribass', 'mercati scendono', 'borsa scende', 'mercato scende', 'crisi', 'bear market', 'panico'], m: 'explainer', s: 'MERCATI • RIBASSI',
      v: ['QUANDO I MERCATI SCENDONO', 'NIENTE PANICO', 'IL ROSSO SUL GRAFICO'],
      h: ['Il mercato scende. Cosa fai?', 'Il portafoglio in rosso fa male. Vendere può fare peggio.', 'I ribassi fanno parte del gioco. Il panico no.'],
      p: [['I crolli sono normali?', 'Sì, fanno parte della storia.', 'Dal 2000 le Borse mondiali hanno avuto {a:quattro cali oltre il 20%}: 2000, 2008, 2020 e 2022.', 'calo', '4 volte'],
        ['Cosa succede se vendi?', 'La perdita diventa definitiva.', 'Vendere dopo un calo {g:rende definitiva la perdita} e ti fa perdere il rimbalzo.', 'errore'],
        ['Qualcuno sa quando finisce?', 'No, non in modo costante.', 'Il punto più basso {b:si riconosce solo dopo}.', 'tempo'],
        ['Quanto ci mettono a recuperare?', 'Da pochi mesi a qualche anno.', 'Nel 2020 le Borse sono tornate ai massimi in {a:pochi mesi}; dopo il 2008 ci sono voluti {g:anni}.', 'crescita']],
      r: [['Il mercato scende.', 'Il tuo piano {g:è cambiato}?']],
      t: ['#mercati', '#borsa', '#investire'] },
    { id: 'bias', n: 'emozioni e bias', k: ['emozion', 'bias', 'psicologia', 'paura', 'fomo', 'avidit', 'finanza comportamentale'], m: 'list', s: 'MENTE • INVESTIRE',
      v: ['LE TRAPPOLE DELLA MENTE', 'IL NEMICO SEI TU', 'BIAS CHE COSTANO'],
      h: ['Il nemico del tuo portafoglio? Spesso sei tu.', 'Le trappole mentali che ti fanno investire male.', 'Non è il mercato. È la testa.'],
      p: [['Perché una perdita fa così male?', 'Avversione alle perdite.', 'Una perdita {g:pesa circa il doppio} di un guadagno uguale.', 'calo'],
        ['Perché si compra quando comprano tutti?', 'Effetto gregge.', 'Si entra perché {a:lo fanno tutti}, spesso vicino ai massimi.', 'errore'],
        ['Si può prevedere il mercato?', 'Eccesso di fiducia.', 'Quasi nessuno ci riesce: chi ci crede fa {b:più operazioni} e paga più costi.', 'commissioni'],
        ['Perché conta tanto il prezzo pagato?', 'Ancoraggio.', 'Al mercato il {a:prezzo di acquisto} non interessa: contano i fatti di oggi.', 'obiettivo']],
      r: [['L’ultima volta che hai deciso,', 'era {g:un piano o un’emozione}?']],
      t: ['#finanzacomportamentale', '#bias', '#investire'] },
    { id: 'budget', n: 'budget e risparmio', k: ['budget', 'risparmiar', 'risparmio', 'spese mensili', 'stipendio', 'fine mese'], m: 'list', s: 'RISPARMIO • METODO',
      v: ['IL BUDGET CHE FUNZIONA', 'RISPARMIARE SENZA SOFFRIRE', 'DOVE VA LO STIPENDIO?'],
      h: ['A fine mese non sai dove sono finiti i soldi?', 'Risparmiare non è tagliare tutto. È decidere prima.', 'Il metodo semplice per tenere un budget.'],
      p: [['Da dove si comincia?', 'Traccia le spese.', 'Per un mese segna {a:tutto}: le sorprese arrivano dalle piccole spese.', 'checklist'],
        ['Quando si risparmia?', 'Paga prima te stesso.', 'Sposta il risparmio {b:appena arriva lo stipendio}, non a fine mese.', 'accumulo'],
        ['C’è una regola semplice?', 'La regola 50/30/20.', '{a:50%} bisogni, {b:30%} desideri, {g:20%} risparmio.', 'diversificazione', '50/30/20'],
        ['Come non mollare?', 'Dai un nome all’obiettivo.', 'Un risparmio {a:con uno scopo} e una data è più facile da mantenere.', 'obiettivo']],
      r: [['Sai quanto hai risparmiato', '{g:il mese scorso}?']],
      t: ['#budget', '#risparmio', '#finanzapersonale'] },
    { id: 'etf', n: 'ETF', k: ['etf', 'fondo indicizzato', 'replica un indice', 'indicizzat'], m: 'explainer', s: 'ETF • GUIDA BASE',
      v: ['GLI ETF IN 30 SECONDI', 'COS’È UN ETF?', 'UN INDICE IN UN TITOLO'],
      h: ['ETF: cosa sono, spiegato semplice.', 'Con un solo acquisto puoi avere centinaia di aziende. Ecco come.', 'Tutti parlano di ETF. Ma cosa compri davvero?'],
      p: [['Cos’è un ETF?', 'Un fondo che si compra in Borsa.', 'Di solito {a:replica un indice}, come l’MSCI World o l’S&P 500.', 'app'],
        ['Cosa compri con un ETF?', 'Un paniere intero.', 'Con un solo acquisto hai quote di {b:centinaia o migliaia} di aziende.', 'diversificazione'],
        ['Quanto costano?', 'Spesso pochi decimi all’anno.', 'Molti ETF su indici ampi costano {g:meno dello 0,3%} l’anno, meno dei fondi attivi.', 'commissioni', '< 0,3%'],
        ['Sono tutti uguali?', 'No: cambiano indice, costi e dividendi.', 'Contano l’indice, il {a:TER} e se è a {b:distribuzione o accumulo}.', 'checklist']],
      r: [['Sai quale indice replica', '{g:ogni ETF} che hai?']],
      t: ['#ETF', '#investire', '#educazionefinanziaria'] },
    { id: 'btp', n: 'BTP e titoli di Stato', k: ['btp', 'titoli di stato', 'bot', 'ctz', 'buoni del tesoro', 'cedola'], m: 'explainer', s: 'TITOLI DI STATO • BASI', tax: 1,
      v: ['BTP E TITOLI DI STATO', 'PRESTARE ALLO STATO', 'COSA SAPERE SUI BTP'],
      h: ['BTP: cosa compri davvero quando presti allo Stato.', 'Titoli di Stato: quattro cose da sapere prima di comprarli.', 'Perché il prezzo di un BTP si muove?'],
      p: [['Cosa compri con un BTP?', 'Un prestito allo Stato.', 'Ricevi {a:cedole} di solito ogni sei mesi e il capitale a scadenza.', 'distribuzione'],
        ['Il prezzo può scendere?', 'Sì, se i tassi salgono.', 'Se vendi prima della scadenza, il prezzo segue i {g:tassi di mercato}.', 'calo'],
        ['Quante tasse si pagano?', 'Il 12,5%, non il 26%.', 'Su cedole e guadagni dei titoli di Stato si paga il {b:12,5%}.', 'tasse', '12,5%'],
        ['C’è un altro vantaggio?', 'Niente imposta di successione.', 'I titoli di Stato sono {a:esenti dall’imposta di successione}.', 'protezione']],
      r: [['Sai quanto pagano davvero i tuoi titoli', '{g:dopo le tasse}?']],
      t: ['#BTP', '#titolidistato', '#obbligazioni'] },
    { id: 'bollo', n: 'imposta di bollo', k: ['imposta di bollo', 'bollo', '34 20', 'dossier titoli'], m: 'explainer', s: 'FISCO • BOLLO', tax: 1,
      v: ['L’IMPOSTA DI BOLLO', 'IL COSTO DI TENERE I TITOLI', 'BOLLO SU CONTI E DOSSIER'],
      h: ['Paghi una tassa solo per avere i tuoi titoli. La conosci?', 'Imposta di bollo: la voce che trovi ogni anno in estratto conto.', 'Bollo sul dossier titoli: come funziona.'],
      p: [['Si paga una tassa solo per avere titoli?', 'Sì: il bollo dello 0,20% annuo.', 'Si calcola sul valore del dossier: su {a:50.000 €} sono {g:100 €} l’anno.', 'tasse', '0,20%'],
        ['E sul conto corrente?', '34,20 € oltre i 5.000 € di giacenza.', 'Per le persone fisiche, {b:34,20 €} l’anno se la giacenza media supera 5.000 €.', 'tasse', '34,20 €'],
        ['Si paga anche in perdita?', 'Sì, perché è sul valore.', 'Non conta il guadagno: {g:si paga anche negli anni negativi}.', 'calo'],
        ['E all’estero?', 'C’è l’IVAFE, con la stessa aliquota.', 'Per le attività finanziarie all’estero l’{a:IVAFE} è dello 0,20%.', 'tasse']],
      r: [['Sai quanto paghi di bollo', '{g:ogni anno}?']],
      t: ['#impostadibollo', '#tasse', '#investimenti'] },
    { id: 'pacpic', n: 'PAC o PIC', k: ['pic', 'tutto subito', 'lump sum', 'unica soluzione', 'pac o pic', 'pac vs pic'], m: 'explainer', s: 'INVESTIRE • INGRESSO',
      v: ['PAC O PIC?', 'TUTTO SUBITO O A RATE?', 'QUANDO ENTRARE'],
      h: ['Hai una somma da investire: tutto subito o un po’ alla volta?', 'PAC o PIC: la differenza non è solo matematica.', 'Entrare tutto insieme o a rate? Ecco cosa dicono i numeri.'],
      p: [['PAC o PIC: cosa cambia?', 'A rate o tutto insieme.', 'Il {a:PAC} entra a rate, il {b:PIC} investe tutta la somma in una volta.', 'confronto'],
        ['Quale ha reso di più in passato?', 'Più spesso il PIC.', 'Con mercati che in media salgono, {b:più tempo investito} ha reso di più in circa due casi su tre.', 'crescita', '2 su 3'],
        ['Allora a cosa serve il PAC?', 'A ridurre il rimpianto.', 'Se il mercato scende subito dopo, il {a:PAC} fa meno male; e chi ha uno stipendio investe comunque a rate.', 'tempo'],
        ['Qual è l’errore vero?', 'Restare fuori ad aspettare.', 'Aspettare il momento perfetto {g:costa di più} che entrare nel modo meno ottimale.', 'errore']],
      r: [['La domanda giusta non è quando entrare.', 'È {g:quanto resti dentro}.']],
      t: ['#PAC', '#PIC', '#investire'] },
    { id: 'azetf', n: 'azioni singole o ETF', k: ['azioni singole', 'singoli titoli', 'stock picking', 'comprare azioni'], m: 'explainer', s: 'INVESTIRE • SCELTE',
      v: ['AZIONI SINGOLE vs ETF', 'UN TITOLO O UN PANIERE?', 'STOCK PICKING?'],
      h: ['Scegliere le azioni una per una o comprare tutto l’indice?', 'Azioni singole o ETF: cosa cambia per il rischio.', 'Vuoi battere il mercato o comprarlo?'],
      p: [['Azioni singole o ETF: cosa cambia?', 'Scegli tu o compri tutto l’indice.', 'Con le {a:azioni singole} scegli tu, con un {b:ETF} compri il paniere intero.', 'confronto'],
        ['Cosa rischi con poche azioni?', 'Che una sola pesi su tutto.', 'Il risultato dipende da {g:poche aziende}: se una crolla, si sente.', 'errore'],
        ['E con un ETF?', 'Diversificazione immediata.', 'Su {b:centinaia di titoli}, con un costo annuo spesso basso.', 'diversificazione'],
        ['Battere l’indice è facile?', 'No: quasi nessuno ci riesce a lungo.', 'Su 15 anni oltre l’{g:85%} dei fondi azionari attivi USA ha fatto peggio del suo indice.', 'tempo', '85%']],
      r: [['Scegli i titoli', 'con {g:un metodo} o con l’istinto?']],
      t: ['#azioni', '#ETF', '#investire'] },
    { id: 'mattone', n: 'investire nel mattone', k: ['mattone', 'immobil', 'seconda casa', 'comprare casa', 'investire casa', 'prezzi case', 'prezzo al metro', 'metro quadro'], m: 'explainer', s: 'IMMOBILIARE • CONTI',
      d: 'Esempio ipotetico a scopo illustrativo. Informazione generale, non consulenza.',
      v: ['IL MATTONE IN NUMERI', 'CASA: QUANTO RENDE?', 'MATTONE, CONTI VERI'],
      h: ['Il mattone non tradisce mai? Ecco i conti veri.', 'Comprare casa per affittarla: quanto rende davvero.', 'Casa come investimento: lordo, netto e rischi in 30 secondi.'],
      p: [['Il mattone è un investimento sicuro?', 'Sicuro no: concentrato sì.', 'Spesso è {g:gran parte del patrimonio} in un solo immobile, in una sola città.', 'diversificazione'],
        ['Quanto costa tenerla?', 'Più di quanto sembra.', 'Su una seconda casa paghi {a:IMU}, manutenzione, assicurazione e i mesi di {b:sfitto}.', 'commissioni'],
        ['Quanto rende al netto?', 'Esempio ipotetico: dal 4,8% lordo al 3%.', '{a:12.000 €} di affitto l’anno su {b:250.000 €} = 4,8% lordo; tolti {g:cedolare al 21%} e 2.000 € di costi, circa il 3%.', 'interesse', '3% netto'],
        ['E se ti servono i soldi?', 'Vendere richiede mesi.', 'Tra agenzia, notaio e trattativa la casa è {g:poco liquida}: un ETF si vende in un giorno.', 'tempo']],
      x: 'Esempio ipotetico: una casa da 250.000 € affittata a 1.000 € al mese rende il 4,8% lordo e circa il 3% netto, dopo cedolare secca al 21% e 2.000 € di costi l’anno.',
      r: [['Sai quanto ti rende la casa', '{g:dopo tasse e costi}?'], ['Il mattone sembra solido.', 'Ma quanto pesa {g:sul tuo patrimonio}?']],
      t: ['#immobiliare', '#mattone', '#investire'] },
    { id: 'affitto', n: 'rendimento di una casa in affitto', k: ['affitt', 'canone', 'cedolare', 'locazion', 'rendimento casa', 'casa in affitto', 'inquilin'], m: 'stat', s: 'IMMOBILIARE • AFFITTO',
      d: 'Esempio ipotetico: casa da 250.000 €, 1.000 €/mese, 2.000 € di costi l’anno. Non è consulenza.',
      v: ['L’AFFITTO IN NUMERI', 'LORDO vs NETTO', 'QUANTO RESTA DELL’AFFITTO'],
      h: ['Affitti una casa al 4,8%? Al netto è molto meno.', 'Affitto: dal lordo al netto in 30 secondi.', 'Quanto resta davvero di un affitto, tolte tasse e costi.'],
      p: [['Quanto rende una casa in affitto, lordo?', 'Canone annuo diviso prezzo.', 'Esempio ipotetico: {a:1.000 €} al mese su una casa da {b:250.000 €} = {g:4,8% lordo}.', 'interesse', '4,8%'],
        ['Quante tasse si pagano sull’affitto?', 'Con la cedolare secca, il 21%.', 'Sul canone libero si paga la {a:cedolare secca al 21%}: di 12.000 € ne restano {g:9.480 €}.', 'tasse', '21%'],
        ['E gli altri costi?', 'IMU, manutenzione e sfitto.', 'Nell’esempio {a:2.000 €} l’anno tra IMU, spese straordinarie e mesi {b:senza inquilino}.', 'commissioni', '-2.000 €'],
        ['Quindi quanto resta?', 'Circa il 3% netto.', '{g:7.480 €} su 250.000 €: dal 4,8% lordo si scende a circa il {g:3%} netto.', 'obiettivo', '3%']],
      x: 'Esempio ipotetico: 1.000 € al mese su 250.000 € sono il 4,8% lordo; dopo cedolare al 21% e 2.000 € di costi restano 7.480 €, circa il 3% netto.',
      r: [['Conosci il rendimento netto', 'della {g:tua casa in affitto}?']],
      t: ['#affitto', '#immobiliare', '#cedolaresecca'] },
    { id: 'mattoneetf', n: 'mattone o ETF', k: ['mattone etf', 'casa etf', 'immobil etf', 'mattone borsa', 'casa borsa', 'immobil azion', 'mattone azion'], m: 'explainer', s: 'MATTONE vs ETF', tax: 1,
      v: ['MATTONE vs ETF', 'CASA O BORSA?', 'DUE INVESTIMENTI, DUE MONDI'],
      h: ['Casa o ETF: la differenza che nessuno ti spiega.', 'Mattone contro Borsa: costi, tasse e tempi a confronto.', 'Comprare casa o un ETF? Ecco cosa cambia.'],
      p: [['Casa o ETF: cosa compri davvero?', 'Un immobile contro migliaia di aziende.', 'Con la {a:casa} possiedi un bene in una zona; con un {b:ETF} globale, quote di {g:migliaia di aziende}.', 'confronto'],
        ['Quale si vende prima?', 'L’ETF, in un giorno.', 'Un {b:ETF} si vende in Borsa in pochi secondi; la {a:casa} richiede mesi, agenzia e notaio.', 'tempo'],
        ['Quale costa di più tenere?', 'Di solito la casa.', 'Casa: {a:IMU, manutenzione, sfitto} e i costi d’acquisto. ETF: un {b:costo annuo} spesso sotto lo 0,5%.', 'commissioni'],
        ['Come sono tassati?', 'Affitto al 21%, guadagni ETF al 26%.', 'Sull’affitto la {a:cedolare secca al 21%}; sui guadagni di un {b:ETF} il {g:26%}, quando vendi o incassi.', 'tasse', '21% vs 26%']],
      r: [['Il tuo patrimonio è più', '{a:mattone} o {b:mercato}?']],
      t: ['#mattone', '#ETF', '#investire'] },
  ]

  function lev(a, b) {
    var p = [], i, j
    for (j = 0; j <= b.length; j++) p[j] = j
    for (i = 1; i <= a.length; i++) {
      var q = [i]
      for (j = 1; j <= b.length; j++) q[j] = Math.min(p[j] + 1, q[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      p = q
    }
    return p[b.length]
  }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() }
  /** 1 exact or prefix, 0.6 typo (1 edit, 2 for long words), 0 none. Short words and numbers only exact. */
  function hitWord(k, toks) {
    var i, w
    for (i = 0; i < toks.length; i++) { w = toks[i]; if (w === k || (k.length > 3 && w.indexOf(k) === 0)) return 1 }
    if (k.length <= 3 || /\d/.test(k)) return 0
    var tol = k.length >= 7 ? 2 : 1
    for (i = 0; i < toks.length; i++) {
      w = toks[i]
      if (w.length < 4) continue
      for (var L = k.length - 1; L <= k.length + 1; L++) if (L <= w.length && lev(w.slice(0, L), k) <= tol) return 0.6
    }
    return 0
  }
  /** Best knowledge-base entry for a topic, or null: every word of a keyword must hit, in any order. */
  function pickTopic(topic) {
    var toks = norm(topic).split(' ').filter(Boolean), best = null, top = 0
    KB.forEach(function (e) {
      var sc = 0
      e.k.forEach(function (k0) {
        var half = k0.charAt(0) === '~', ws = norm(k0).split(' '), sum = 0
        for (var i = 0; i < ws.length; i++) { var h = hitWord(ws[i], toks); if (!h) return; sum += h * (ws[i].length <= 3 ? 5 : ws[i].length) }
        sc += half ? sum / 2 : sum
      })
      if (sc > top) { top = sc; best = e }
    })
    return top >= 4 ? best : null
  }
  /** Figures the user wrote: percentages, euro amounts, years, "al mese", a count ("5 errori"). */
  function figures(topic) {
    var s = ' ' + String(topic || '').toLowerCase().replace(/(\d)\s*(k|mila)\b/g, function (m, d) { return d + '000' }) + ' ', m, f = { pcts: [], eur: 0, years: 0, monthly: false, count: 0 }
    var re = /(\d+(?:[.,]\d+)?)\s*(?:%|per ?cento)/g
    while ((m = re.exec(s))) f.pcts.push(parseFloat(m[1].replace(',', '.')))
    m = s.match(/€\s*(\d[\d.]*(?:,\d+)?)|(\d[\d.]*(?:,\d+)?)\s*(?:€|euro\b|eur\b)/)
    if (m) f.eur = amount(m[1] || m[2]) || 0
    m = s.match(/(\d{1,2})\s*anni/)
    if (m) f.years = +m[1]
    f.monthly = /al mese|mensil|ogni mese/.test(s)
    m = s.match(/\b([2-9]|10)\s+(errori|consigli|passi|cose|modi|regole|motivi|trucchi|domande|segnali|step|abitudini)/)
    if (m) f.count = +m[1]
    return f
  }
  var ORD = ['Primo', 'Secondo', 'Terzo', 'Quarto', 'Quinto', 'Sesto', 'Settimo', 'Ottavo']
  var TEXT_KINDS = { post: 1, carosello: 1, carousel: 1, thread: 1, linkedin: 1, x: 1, tweet: 1, newsletter: 1, email: 1, articolo: 1, blog: 1, caption: 1, didascalia: 1 } // no script; reel, storia and unknown kinds get one
  function mk(s) { return esc(s).replace(/\{(a|b|g):([^}]*)\}/g, function (m, k, x) { return '<span class="hl-' + (k === 'g' ? 'gold' : k) + '">' + x + '</span>' }) }
  function unmk(s) { return String(s).replace(/\{(?:a|b|g):([^}]*)\}/g, '$1') }
  function capFirst(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1) }
  function pctTxt(p) { return nf(p, p % 1 ? (Math.round(p * 100) % 10 ? 2 : 1) : 0) + '%' }
  function eurT(v) { return nf(v, 0) + ' €' }
  function yearsOf(N) { var st = Math.max(1, Math.ceil(N / 15)), ys = []; for (var y = 0; y < N; y += st) ys.push(y); ys.push(N); return ys }
  function thirds(n) { var i1 = Math.floor((n - 1) / 3), i2 = Math.max(i1 + 1, Math.floor(2 * (n - 1) / 3)); return [[0, i1], [i1 + 1, i2], [i2 + 1, n - 1]] }
  var STOP = ' il lo la i gli le un una uno di da a in con su per tra fra e o ed oppure come cosa cos e perche quando quale quali quanto che del della dei delle degli al alla ai alle nel nella nei sul sulla mio tuo suo vs contro differenza fare sono non piu meglio '

  /** The computed examples: real maths on the user's figures, hypothetical defaults otherwise (always declared as such). */
  function calcOf(kind, f) {
    var N = clampN(f.years || (kind === 'comp' ? 30 : 20), 3, 50), ys = yearsOf(N), n = ys.length, T = thirds(n), o = { N: N, ys: ys, T: T }
    var label = function (y) { return { label: 'A' + y, fullDate: 'Anno ' + y } }
    if (kind === 'ter' || kind === 'rend2') {
      var ps = f.pcts.slice().sort(function (x, y) { return x - y }), C = f.eur || 10000, r, lo, hi
      if (kind === 'ter') {
        r = ps.length >= 3 ? ps.pop() : 6
        lo = ps.length >= 2 ? ps[0] : ps.length ? Math.min(ps[0], 0.2) : 0.2
        hi = ps.length >= 2 ? ps[ps.length - 1] : ps.length && ps[0] > 0.2 ? ps[0] : 1.8
      } else { hi = ps[0]; lo = ps[ps.length - 1] } // rend2: a = the higher return
      if (lo === hi) hi = lo + 1
      var gA = kind === 'ter' ? (r - lo) / 100 : lo / 100, gB = kind === 'ter' ? (r - hi) / 100 : hi / 100
      o.data = ys.map(function (y) { var d = label(y); d.a = Math.round(C * Math.pow(1 + gA, y)); d.b = Math.round(C * Math.pow(1 + gB, y)); return d })
      var last = o.data[n - 1], mid = o.data[T[1][1]], diff = last.a - last.b
      o.final = [last.a, last.b]
      o.series = kind === 'ter'
        ? { a: { name: 'TER ' + pctTxt(lo), ticker: 'BASSO', color: '#38BDF8', subLabel: 'Costo annuo più basso' }, b: { name: 'TER ' + pctTxt(hi), ticker: 'ALTO', color: '#F97316', subLabel: 'Costo annuo più alto' } }
        : { a: { name: 'Rendimento ' + pctTxt(lo), ticker: 'A', color: '#38BDF8', subLabel: 'Ipotesi costante' }, b: { name: 'Rendimento ' + pctTxt(hi), ticker: 'B', color: '#10B981', subLabel: 'Ipotesi costante' } }
      o.title = kind === 'ter' ? 'TER ' + pctTxt(lo) + ' vs ' + pctTxt(hi) : pctTxt(lo) + ' vs ' + pctTxt(hi)
      o.sub = 'SU ' + N + ' ANNI'
      o.header = eurT(C) + ' per ' + N + ' anni • ' + (kind === 'ter' ? 'TER ' : '') + pctTxt(lo) + ' vs ' + pctTxt(hi) + ' • esempio ipotetico'
      o.disc = kind === 'ter' ? 'Esempio ipotetico: ' + eurT(C) + ' al ' + pctTxt(r) + ' annuo lordo meno il TER, per ' + N + ' anni, senza tasse. Non è consulenza.'
        : 'Esempio ipotetico: ' + eurT(C) + ' a rendimenti costanti per ' + N + ' anni, senza costi né tasse. Non è consulenza.'
      o.chapters = [
        { q: 'Cosa cambia tra le due?', title: kind === 'ter' ? 'Solo il costo annuo.' : 'Solo il rendimento.', text: kind === 'ter' ? 'Si parte da {a:' + eurT(C) + '}: {a:' + pctTxt(lo) + '} contro {b:' + pctTxt(hi) + '} di costo l’anno, stesso mercato.' : 'Si parte da {a:' + eurT(C) + '}: {a:' + pctTxt(lo) + '} contro {b:' + pctTxt(hi) + '} l’anno.' },
        { q: 'Quanto pesa dopo ' + ys[T[1][1]] + ' anni?', title: eurT(mid.a - mid.b) + ' di distanza.', text: '{a:' + eurT(mid.a) + '} contro {b:' + eurT(mid.b) + '}: la differenza si compone {g:ogni anno}.' },
        { q: 'E alla fine?', title: 'Dopo ' + N + ' anni: ' + eurT(diff) + ' di differenza.', accent: 'gold', text: 'Nell’esempio la differenza è {g:' + eurT(diff) + '}, il {g:' + Math.round(diff / last.a * 100) + '%} del risultato migliore.' }]
      o.example = 'Esempio ipotetico: ' + eurT(C) + ' per ' + N + ' anni diventano ' + eurT(last.a) + ' con ' + o.series.a.name + ' e ' + eurT(last.b) + ' con ' + o.series.b.name + ': ' + eurT(diff) + ' di differenza.'
      o.mode = 'race'
      o.milestones = [{ idx: n - 1, label: '€' + nf(last.a, 0), target: 'a', dir: 'top' }, { idx: n - 1, label: '€' + nf(last.b, 0), target: 'b', dir: 'bottom' }]
      return o
    }
    if (kind === 'comp' || kind === 'pac') {
      var rr = f.pcts.length ? f.pcts[f.pcts.length - 1] : 5, pac = kind === 'pac', M = f.eur || (pac ? 200 : 10000), i = rr / 1200
      var val = function (y) { return pac ? (i ? M * (Math.pow(1 + i, 12 * y) - 1) / i : M * 12 * y) : M * Math.pow(1 + rr / 100, y) }
      var paid = function (y) { return pac ? M * 12 * y : M }
      o.data = ys.map(function (y) { var d = label(y); d.a = Math.round(val(y)); return d })
      var e1 = ys[T[0][1]], e2 = ys[T[1][1]], A1 = o.data[T[0][1]].a, A2 = o.data[T[1][1]].a, AN = o.data[n - 1].a, VN = paid(N)
      o.final = [AN]
      o.series = { a: { name: pac ? 'PAC ' + nf(M, 0) + ' €/MESE' : 'CAPITALE ' + nf(M, 0) + ' €', ticker: pac ? 'PAC' : 'CAP', color: '#38BDF8', subLabel: 'Ipotesi ' + pctTxt(rr) + ' annuo costante' } }
      o.title = pac ? nf(M, 0) + ' € AL MESE' : nf(M, 0) + ' € AL ' + pctTxt(rr)
      o.sub = 'PER ' + N + ' ANNI'
      o.header = (pac ? nf(M, 0) + ' € al mese' : eurT(M)) + ' per ' + N + ' anni • esempio ipotetico al ' + pctTxt(rr) + ' annuo'
      o.disc = 'Esempio ipotetico: ' + (pac ? nf(M, 0) + ' €/mese' : eurT(M)) + ' al ' + pctTxt(rr) + ' annuo costante per ' + N + ' anni, senza costi né tasse. Non è consulenza.'
      o.chapters = pac ? [
        { q: 'Quanto vale dopo ' + e1 + ' anni?', title: eurT(A1) + ', quasi tutto versato.', text: 'Hai messo {a:' + eurT(paid(e1)) + '}: all’inizio conta quello che versi.' },
        { q: 'E dopo ' + e2 + ' anni?', title: eurT(A2) + ': il tempo inizia a lavorare.', text: '{a:' + eurT(paid(e2)) + '} versati, {b:' + eurT(A2) + '} nell’esempio.' },
        { q: 'E dopo ' + N + ' anni?', title: eurT(AN) + ' in tutto.', accent: 'gold', text: '{a:' + eurT(VN) + '} versati, {g:' + eurT(AN - VN) + '} dal rendimento composto nell’esempio.' }] : [
        { q: 'Cos’è l’interesse composto?', title: 'Interessi che producono altri interessi.', text: 'Esempio ipotetico: {a:' + eurT(M) + '} al ' + pctTxt(rr) + ' dopo ' + e1 + ' anni sono già {a:' + eurT(A1) + '}.' },
        { q: 'E dopo ' + e2 + ' anni?', title: eurT(A2) + ': la curva si piega.', text: 'Gli interessi producono {g:altri interessi}.' },
        { q: 'E dopo ' + N + ' anni?', title: eurT(AN) + ' in tutto.', accent: 'gold', text: 'Nell’esempio {g:' + eurT(AN - M) + '} arrivano dagli interessi composti, senza nuovi versamenti.' }]
      o.example = pac ? 'Esempio ipotetico: ' + nf(M, 0) + ' € al mese per ' + N + ' anni al ' + pctTxt(rr) + ' annuo fanno ' + eurT(VN) + ' versati e ' + eurT(AN) + ' finali.'
        : 'Esempio ipotetico: ' + eurT(M) + ' al ' + pctTxt(rr) + ' annuo per ' + N + ' anni diventano ' + eurT(AN) + '.'
      o.mode = 'growth'
      o.milestones = [{ idx: T[1][1], label: e2 + ' anni • €' + nf(A2, 0), target: 'a' }, { idx: n - 1, label: N + ' anni • €' + nf(AN, 0), target: 'a' }]
      return o
    }
    if (kind === 'infl') {
      var C2 = f.eur || 10000, p = f.pcts.length ? f.pcts[0] : 2, real = C2 / Math.pow(1 + p / 100, N), loss = Math.round((1 - real / C2) * 100)
      o.final = [Math.round(real)]
      o.title = 'IL LADRO SILENZIOSO'; o.sub = N + ' ANNI DI INFLAZIONE'
      o.header = eurT(C2) + ' fermi per ' + N + ' anni • inflazione ipotetica al ' + pctTxt(p)
      o.disc = 'Esempio ipotetico: inflazione costante al ' + pctTxt(p) + ' annuo per ' + N + ' anni. Non è consulenza.'
      o.chapters = [
        { q: 'Quanto hai sul conto?', big: '€' + nf(C2, 0), caption: 'Oggi sul conto', title: eurT(C2) + ', fermi.', text: 'Lasci {a:' + eurT(C2) + '} fermi sul conto per {a:' + N + ' anni}.' },
        { q: 'Quanto salgono i prezzi?', big: N + ' anni', caption: 'Inflazione ipotetica al ' + pctTxt(p) + ' annuo', accent: 'b', title: 'Il ' + pctTxt(p) + ' l’anno, per ' + N + ' anni.', text: 'Con un’inflazione del {b:' + pctTxt(p) + '} l’anno, ogni anno compri un po’ meno.' },
        { q: 'Quanto valgono dopo ' + N + ' anni?', big: '€' + nf(real, 0), caption: 'Il potere d’acquisto nell’esempio', accent: 'gold', title: 'Come ' + eurT(real) + ' di oggi.', text: 'Dopo ' + N + ' anni quei soldi comprano come {g:' + eurT(real) + '} di oggi.' },
        { q: 'Quanto hai perso?', big: '-' + loss + '%', caption: 'Potere d’acquisto perso', title: 'Il ' + loss + '% senza veder uscire un euro.', text: 'Il numero non cambia, ma perdi il {g:' + loss + '%} del potere d’acquisto.' }]
      o.example = 'Esempio ipotetico: con un’inflazione al ' + pctTxt(p) + ' annuo, ' + eurT(C2) + ' fermi per ' + N + ' anni comprano come ' + eurT(real) + ' di oggi.'
      o.mode = 'stat'
      return o
    }
    return null
  }

  /* the two subjects of a comparison ("Roma e Milano", "Roma vs Milano", "tra X e Y", "X o Y"); request words around them are dropped */
  var FILL = /^(confront\w*|paragon\w*|compar\w*|mett\w*|differenz\w*|andament\w*|evoluzion\w*|settore|mercato|mercati|prezz\w*|quotazion\w*|valor\w*|rendiment\w*|crescit\w*|storia|immobil\w*|cas[ae]|mattone|dimmi|spiegami|mostrami|fammi|vedere|vedi|chi|cosa|dove|quale|meglio|conviene|convengono|rende|rendono|costa|va|vanno|e|è|sono|ha|hanno|tra|fra|il|lo|la|i|gli|le|un|una|uno|l|l’|del|della|dello|dei|degli|delle|di|da|dal|dalla|dai|dagli|a|al|alla|ai|agli|in|nel|nella|nei|negli|su|sul|sulla|per|con|ultim\w*|anni|anno|mesi|oggi|ed|o|oppure|vs|versus|contro|\d+)$/i
  function sideOf(s, fromEnd, keep) {
    var ws = s.replace(/[’']/g, '’ ').split(/\s+/).filter(Boolean), out = []
    if (fromEnd) ws.reverse()
    for (var i = 0; i < ws.length && out.length < 3; i++) {
      var w = ws[i].replace(/^[«"“(]+|[»"”).,;:!?]+$/g, '')
      if (!w) continue
      if (FILL.test(w) && !(keep && out.length && /^(a|di|da)$/i.test(w))) { if (out.length) break; continue }
      out.push(w)
    }
    if (fromEnd) out.reverse()
    return out.join(' ')
  }
  function pairOf(raw0) {
    var s = String(raw0 || ''), m, A = '', B = ''
    if ((m = s.match(/\b(?:tra|fra)\s+(.+?)\s+(?:e|ed|o|oppure|vs\.?|versus|contro)\s+(.+)$/i))) { A = sideOf(m[1].split(/[?!.,;:]/)[0], false, true); B = sideOf(m[2].split(/[?!.,;:]/)[0], false) }
    else if ((m = s.match(/^(.+?)\s+(?:vs\.?|versus|contro|oppure|o)\s+(.+)$/i))) { A = sideOf(m[1].split(/[?!.,;:]/).pop(), true); B = sideOf(m[2].split(/[?!.,;:]/)[0], false) }
    else if ((m = s.match(/^(.+?)\s+(?:e|ed)\s+(.+)$/i))) {
      A = sideOf(m[1].split(/[?!.,;:]/).pop(), true); B = sideOf(m[2].split(/[?!.,;:]/)[0], false)
      // "X e Y" is a comparison only when asked for one, or between two names ("Roma e Milano")
      if (!/confront|paragon|compar|differenz|meglio|chi ha/i.test(s) && !(/^[A-ZÀ-Ý]/.test(A) && /^[A-ZÀ-Ý]/.test(B))) A = B = ''
    }
    return A && B && A.toLowerCase() !== B.toLowerCase() ? [A, B] : null
  }
  /** Two places, real estate: general, correct answers and one labelled hypothetical example, no invented city figures. */
  /* well-known public figures, rounded (asking prices per m², Immobiliare.it, 2024) and the 20-year trend; s = how much prices grew over ~20 years, 0 (least) to 3.
     shortcut: a handful of big cities, values to refresh once a year; other cities get the general answer */
  var CITY = {
    milano: { m2: '5.300 €/m²', s: 3, trend: 'su forte dall’Expo 2015' },
    bologna: { m2: '3.700 €/m²', s: 2, trend: 'in salita, spinta da studenti e turismo' },
    firenze: { m2: '4.300 €/m²', s: 2, trend: 'in salita, spinta dal turismo' },
    roma: { m2: '3.400 €/m²', s: 1, trend: 'ancora sotto i massimi del 2008' },
    napoli: { m2: '2.900 €/m²', s: 1, trend: 'ripresa solo negli ultimi anni' },
    torino: { m2: '2.100 €/m²', s: 0, trend: 'ancora ben sotto i massimi del 2008' }
  }
  var cityOf = function (x) { return CITY[norm(x).replace(/ /g, '')] }
  function cityPoints(A, B, N) {
    var a = cityOf(A), b = cityOf(B), w = a && b && a.s !== b.s ? (a.s > b.s ? [A, a, B, b] : [B, b, A, a]) : null
    var q1 = (N ? 'In ' + N + ' anni chi' : 'Chi') + ' è andata meglio, ' + A + ' o ' + B + '?'
    return [w ? [q1, w[0] + (w[1].s - w[3].s >= 2 ? ', nettamente.' : ', di misura.'), '{a:' + w[0] + '} circa ' + w[1].m2 + ', ' + w[1].trend + '. {b:' + w[2] + '} circa ' + w[3].m2 + ', ' + w[3].trend + '.', 'confronto', A + ' vs ' + B]
      : [q1, 'Ha reso di più dove sono arrivati lavoro e università.', 'Conta il {a:prezzo al m²} più gli {b:affitti}, tolti tasse e costi: nelle grandi città del Nord è salito di più.', 'confronto', A + ' vs ' + B],
      ['Perché due città si separano?', 'Lavoro, studenti e poche case nuove.', 'Dove arrivano {a:lavoro e università} e si costruisce poco, il prezzo sale di più.', 'crescita'],
      ['Quanto rende una casa in affitto?', 'Esempio ipotetico: 4,8% lordo, 3% netto.', '{a:1.000 €} al mese su {b:250.000 €}, tolti {g:cedolare al 21%} e costi.', 'commissioni', '3% netto'],
      ['E se servono i soldi?', 'La casa non si vende in un giorno.', 'Servono {a:mesi}: è un bene {g:poco liquido}, e spesso è quasi tutto il patrimonio.', 'tempo']]
  }
  var GEN_STAT = ['3 risposte', 'Perché', '1 errore', '1 passo']

  /** A topic the user typed → {config (VIDEO_CONFIG, already validated), draft (post text and ~30 s script)}. Deterministic: same input, same output; another seed, another version. */
  function fromTopic(topic, opts) {
    opts = obj(opts)
    var b0 = obj(opts.brand), name = str(b0.name, 28) || 'Yourv€$t', yv = /yourv/i.test(name), say = yv ? 'Yourvest' : name.replace(/[€$#*_]/g, '')
    var seed = Math.abs(Math.floor(num(opts.seed, 0))) || 0, kind = String(opts.kind || 'reel').toLowerCase()
    var pick = function (a, slot) { return a[(seed + (slot || 0)) % a.length] }
    var raw0 = str(topic, 140) || 'Investire con metodo', low = ' ' + norm(raw0) + ' ', f = figures(raw0)
    var parts = pairOf(raw0), cmp = !!parts || / (vs|contro|oppure|differenza|meglio|versus) /.test(low)
    var costy = / ter | (cost|commission|spese)/.test(low)
    var listy = / (errori|errore|consigli|passi|step|regole|trucchi|modi per|cose da|abitudini|come (fare|iniziare|scegliere|risparmiare|evitare|smettere|organizzare|migliorare|imparare)) /.test(low) || f.count > 0
    var e = pickTopic(raw0)
    // two places and real estate: the city template, not the generic "mattone" entry
    var city = !!(e && (e.id === 'mattone' || e.id === 'affitto') && parts && !parts.some(function (x) { return /mattone|immobil|cas[ae]\b|etf|affitt|mutuo|azion|obblig|fond|oro|btp|borsa|conto|deposit/i.test(x) }))
    // the maths the figures call for; a knowledge-base entry brings its own example when the user gives none
    var numCalc = f.pcts.length >= 2 && (cmp || costy) ? (costy ? 'ter' : 'rend2') : f.eur && f.monthly ? 'pac' : f.pcts.length && (f.eur || f.years) ? 'comp' : ''
    if (e && e.id === 'ter' && f.pcts.length === 1) numCalc = 'ter'
    var calc = city ? '' : e ? (numCalc && !e.calc ? (e.m === 'explainer' || e.m === 'list' ? '' : numCalc) : e.calc || '') : numCalc
    if (!city && e && e.calc && numCalc && numCalc !== e.calc && (numCalc === 'ter' || numCalc === 'rend2')) calc = numCalc
    if (calc === 'comp' && f.monthly && f.eur) calc = 'pac' // "300 euro al mese" is a monthly plan, not a lump sum
    var C = calc ? calcOf(calc, f) : null
    var fin = e ? true : / (invest|soldi|euro|risparm|borsa|azion|fond|banca|conto|mutuo|prestit|debit|tasse|fisco|pension|finanz|rendiment|interess|portafogl|cripto|bitcoin|stipendi|spes) /.test(low) || !!(f.eur || f.pcts.length)
    var tax = !!(e && e.tax) && !city

    /* the subject of a free topic: the words without question words and articles */
    var subj = raw0.replace(/^\s*(\d+\s+)?(spiegami|dimmi|raccontami)?\s*(come|perch[eé]|cos[’']?[eè]|cosa sono|cosa|quando|quale|quali|quanto)\s+/i, '').replace(/[?!.]+$/, '').trim() || raw0

    /* points (body chapters): [question, answer title, answer text, scene, big] */
    var P, titles, hooks, provs, tags, sector, A0 = parts && capFirst(parts[0]), B0 = parts && capFirst(parts[1])
    if (city) {
      var AB = A0 + ' vs ' + B0
      P = cityPoints(A0, B0, f.years)
      titles = [A0.toUpperCase() + ' vs ' + B0.toUpperCase(), 'IL MATTONE A CONFRONTO', A0.toUpperCase() + ' O ' + B0.toUpperCase() + '?']
      hooks = [A0 + ' o ' + B0 + ': dove la casa ha reso di più?', 'Case a ' + A0 + ' e ' + B0 + ': come si confrontano davvero.', A0 + ' contro ' + B0 + ': il mattone in 30 secondi.']
      provs = [['Sai quanto rende davvero la tua casa,', '{g:al netto di tasse e costi}?'], ['Il mattone sembra solido.', 'Ma quanto pesa {g:sul tuo patrimonio}?']]
      tags = ['#immobiliare', '#' + norm(parts[0]).replace(/ /g, ''), '#' + norm(parts[1]).replace(/ /g, '')]
      sector = 'IMMOBILIARE • ' + cut(AB.toUpperCase(), 24)
    } else if (e) {
      P = e.p.slice(); titles = e.v; hooks = e.h; provs = e.r; tags = e.t; sector = e.s
    } else {
      var S = cut(subj, 40), Sl = /^[A-Z]{2}|^[A-Z][a-z]+\s+[A-Z]/.test(S) ? S : S.charAt(0).toLowerCase() + S.slice(1) // keep "ETF…" or "Milan Inter" as typed
      if (parts) P = [[A0 + ' o ' + B0 + ': cosa le distingue?', 'Due strade con pregi diversi.', 'Il confronto onesto mette {a:' + A0 + '} e {b:' + B0 + '} sugli stessi criteri e sullo stesso periodo.', 'confronto'],
        ['Su cosa si decide?', 'Sul risultato netto, non su quello di vetrina.', 'Conta quello che resta {g:dopo costi e tempo}: lì si vede la differenza vera.', 'obiettivo'],
        ['Perché due scelte simili finiscono lontane?', 'Le piccole differenze si sommano.', 'Un piccolo vantaggio ripetuto {g:ogni anno} diventa una distanza grande.', 'tempo'],
        ['Quindi chi vince?', 'Chi è avanti sui numeri, non sulle opinioni.', 'Tra {a:' + A0 + '} e {b:' + B0 + '} vince chi ottiene di più con meno, sullo stesso periodo.', 'crescita']]
      else if (listy && /error|sbagl/.test(low)) P = [['Qual è il primo errore?', 'Partire senza le basi.', 'Saltare le basi {g:costa tempo} dopo.', 'errore'], ['Serve andare veloci?', 'No: la fretta è un errore.', 'I risultati veri {a:chiedono tempo}.', 'tempo'], ['Copiare chi ci è riuscito funziona?', 'Non così com’è.', 'Quello che funziona per altri {b:va adattato} a te.', 'obiettivo'], ['Come capisci se sbagli?', 'Misurando.', 'Senza controllare i progressi {g:non sai se migliori}.', 'checklist'], ['E al primo ostacolo?', 'Si continua.', 'Gli intoppi {a:fanno parte} del percorso.', 'crescita']]
      else if (listy) P = [['Da dove si parte?', 'Dalle basi.', 'Prima capisci {a:come funziona} davvero.', 'checklist'], ['Serve un obiettivo?', 'Sì, concreto e con una data.', 'Un traguardo chiaro {b:ti tiene in rotta}.', 'obiettivo'], ['Quanto spesso?', 'Poco, ma con costanza.', 'La costanza {g:batte l’entusiasmo} del primo giorno.', 'tempo'], ['Qual è l’errore più comune?', 'Voler fare tutto subito.', 'Un passo alla volta {g:porta più lontano}.', 'errore'], ['Come vedi i progressi?', 'Misurandoli.', 'Quello che misuri {a:migliora}.', 'crescita']]
      else P = [['Di cosa parliamo?', capFirst(cut(S, 44)) + ', in tre risposte.', pick(['Tre domande semplici su {a:' + Sl + '}, una risposta alla volta.', 'Una cosa alla volta: {a:' + Sl + '}, senza giri di parole.'], 1), 'app'],
        ['Perché conta?', 'Perché cambia le scelte di ogni giorno.', pick(['Chi lo conosce bene {b:sceglie meglio} e non si affida al caso.', 'Chi lo conosce davvero {b:evita sorprese}.'], 2), 'obiettivo'],
        ['Qual è l’errore più comune?', 'Fermarsi alla superficie.', pick(['{g:Dare tutto per scontato} è il modo più rapido per sbagliare.', 'Partire senza un piano e {g:voler fare tutto subito}.'], 3), 'errore'],
        ['Da dove si comincia?', 'Dalle basi, un passo alla volta.', pick(['Le {a:basi solide} rendono facile tutto il resto.', 'Prima le basi, poi i dettagli: {a:in quest’ordine}.'], 4), 'checklist']]
      var SU = S.toUpperCase()
      titles = parts ? [cut(A0, 20).toUpperCase() + ' vs ' + cut(B0, 20).toUpperCase(), 'LE DIFFERENZE VERE', 'LA DIFFERENZA IN 30 SECONDI'] : listy ? [SU, 'COSA SAPERE', 'IN POCHI PASSI'] : [SU, 'SPIEGATO SEMPLICE', 'IN 30 SECONDI']
      hooks = parts ? [A0 + ' o ' + parts[1] + '? Ecco cosa cambia davvero.', 'Tutti scelgono tra ' + parts[0] + ' e ' + parts[1] + '. Pochi sanno perché.', 'La differenza tra ' + parts[0] + ' e ' + parts[1] + ', in 30 secondi.']
        : listy ? [capFirst(cut(raw0.replace(/[?!.]+$/, ''), 60)) + (/error|sbagl/.test(low) ? ': # errori da non fare.' : ': # passi per partire bene.'), 'Da dove si comincia? # punti, in ordine.', capFirst(cut(raw0.replace(/[?!.]+$/, ''), 60)) + '? Parti da qui.']
          : [capFirst(S) + ': quello che devi sapere in 30 secondi.', 'Tutti parlano di ' + Sl + '. Ecco cosa conta davvero.', capFirst(Sl) + ', spiegato semplice.']
      provs = parts ? [['Tu da che parte stai:', '{a:' + parts[0] + '} o {b:' + parts[1] + '}?'], ['Hai scelto', 'per {g:abitudine} o per davvero?']] : [['Adesso lo sai.', 'Il prossimo passo {g:è tuo}.'], ['Quanto ne sapevi davvero', 'di {a:' + cut(Sl, 40) + '}?']]
      tags = norm(subj).split(' ').filter(function (w) { return w.length >= 4 && STOP.indexOf(' ' + w + ' ') < 0 }).slice(0, 3).map(function (w) { return '#' + w })
      if (!tags.length) tags = ['#consigli']
      sector = (fin ? 'FINANZA' : 'GUIDA') + ' • ' + cut(SU, 24)
    }
    // counts: "5 errori" takes 5 points; a list rotates its order with the seed (every point keeps its own copy)
    var mode = C ? C.mode : city ? 'explainer' : e ? e.m : parts ? 'explainer' : listy ? 'list' : f.eur || f.pcts.length ? 'stat' : 'explainer'
    if (mode === 'list' && seed) { var rot = seed % P.length; P = P.slice(rot).concat(P.slice(0, rot)) }
    if (f.count && (mode === 'list' || !C)) P = P.slice(0, Math.max(2, Math.min(f.count, P.length)))
    else P = P.slice(0, 4) // a reel stays around 45 s at 1×: every point is a question plus its answer
    var nP = P.length, hash = function (s) { return String(s).replace(/#/g, nP) }

    /* chapters: the question first, then the answer (title + text, scene or big number) */
    var acc0 = seed % 2, chapters
    if (C && C.data) {
      chapters = C.chapters.map(function (c1, k) { return { startIdx: C.T[k][0], endIdx: C.T[k][1], accent: c1.accent || (k % 2 ? 'b' : 'a'), pill: 'ANNI ' + C.ys[C.T[k][0]] + '–' + C.ys[C.T[k][1]], q: c1.q, title: c1.title, html: mk(c1.text), speech: c1.q + ' ' + c1.title + ' ' + unmk(c1.text) } })
    } else if (C) {
      chapters = C.chapters.map(function (c1, k) { return { big: c1.big, caption: c1.caption, accent: c1.accent || (k % 2 ? 'b' : 'a'), pill: '', q: c1.q, title: c1.title, html: mk(c1.text), speech: c1.q + ' ' + c1.title + ' ' + unmk(c1.text) } })
    } else {
      var single = mode === 'stat' ? (f.pcts.length ? pctTxt(f.pcts[0]) : '€' + nf(f.eur, 0)) : ''
      chapters = P.map(function (p, k) {
        var q = hash(p[0]), t1 = hash(p[1])
        var ch = { accent: (k + acc0) % 2 ? 'b' : 'a', pill: t1.length <= 24 ? t1.replace(/[.?!]+$/, '').toUpperCase() : '', q: q, title: t1, html: mk(p[2]), speech: q + ' ' + t1 + ' ' + unmk(p[2]) }
        if (mode === 'explainer' && p[3]) ch.scene = p[3]
        if (mode === 'list') { ch.big = String(k + 1); ch.caption = t1.replace(/[.]+$/, ''); ch.pill = '' }
        if ((mode === 'news' || mode === 'explainer') && p[4]) ch.big = p[4]
        if (mode === 'stat') { ch.big = p[4] || (k ? GEN_STAT[k % 4] : single); ch.caption = t1.replace(/[.]+$/, '') }
        return ch
      })
      if (mode === 'list' || mode === 'stat') chapters.forEach(function (ch) { ch.pill = '' })
    }

    /* acts 1, 3, 4 */
    var hook = hash(pick(hooks, 0)), prov = pick(provs, 1)
    var disc = C ? C.disc : city ? (cityOf(A0) && cityOf(B0) ? 'Dati indicativi da fonti pubbliche (Immobiliare.it). Affitto: esempio ipotetico. Non è consulenza.' : cut('Esempio ipotetico, non dati reali di ' + A0 + ' e ' + B0 + '. Non è consulenza.', 120)) : e && e.d ? e.d : tax ? 'Informazione generale, non consulenza fiscale.' : fin ? 'Informazione generale, non consulenza finanziaria.' : 'Contenuto informativo generale.'
    var feats = arr(b0.features).map(obj).filter(function (x) { return str(x.title) }).slice(0, 4)
    var badge = pick(yv ? ['Tutto il tuo portafoglio, in un posto solo.', 'I tuoi numeri, sempre chiari.', 'Meno confusione, più controllo.'] : ['Tutto più chiaro, in un posto solo.', 'Il passo successivo è semplice.', 'Inizia da qui.'], 2)
    var ctaSpeech = pick(yv && !fin ? ['Segui Yourvest per altri spiegoni in 30 secondi. Link in bio.', 'Ti è servito? Segui Yourvest. Link in bio.'] : yv ? ['Con Yourvest vedi tutto il tuo portafoglio in un posto solo. Link in bio.', 'Tieni tutto sotto controllo con Yourvest. Link in bio.', 'Prova Yourvest: il link è in bio.'] : ['Scopri ' + say + '. Link in bio.', 'Prova ' + say + ': il link è in bio.'], 3)
    var raw = {
      format: opts.format, mode: mode, sector: sector, brand: { name: name },
      headerSubtitle: C ? C.header : city ? A0 + ' vs ' + B0 + ' • prezzi, affitti e rendimento netto' : capFirst(cut(raw0, 80)),
      intro: { title: C && !e ? C.title : hash(pick(titles, 0)), subtitle: C ? C.sub : city && f.years ? f.years + ' ANNI DI MATTONE' : pick(['IN 30 SECONDI', 'LE RISPOSTE, IN BREVE', 'LA VERSIONE SEMPLICE', 'SENZA GIRI DI PAROLE'], 1), description: hook, speech: hook },
      chapters: chapters,
      provocation: { line1: mk(prov[0]), line2: mk(prov[1]), speech: unmk(prov[0]) + ' ' + unmk(prov[1]) },
      cta: { badge: badge, subtitle: yv ? 'Yourv€$t mette insieme i tuoi investimenti, con il fisco italiano già fatto:' : '', features: feats, button: 'Link in bio', speech: ctaSpeech },
      disclaimer: disc,
    }
    if (C && C.data) { raw.series = C.series; raw.unit = { prefix: '€', negativePrefix: '-€', suffix: '', spreadSuffix: '', decimals: 0, higherIsBetter: true }; raw.data = C.data; raw.milestones = C.milestones; raw.chartWatermark = 'VALORE NEL TEMPO • ESEMPIO IPOTETICO' }
    var config = validate(raw)

    /* the post: three titles, body, a ~30 s script (video formats only), CTA, hashtags; every point = question + answer */
    var plainPts = P.map(function (p, k) { return (mode === 'list' ? (k + 1) + '. ' : '') + hash(p[0]) + ' ' + hash(p[1]) + ' ' + unmk(p[2]) })
    var example = C ? C.example : city ? 'Esempio ipotetico: una casa da 250.000 € affittata a 1.000 € al mese rende il 4,8% lordo e circa il 3% netto, dopo cedolare secca al 21% e 2.000 € di costi l’anno.' : e && e.x ? e.x : ''
    var proQ = unmk(prov[0]) + ' ' + unmk(prov[1])
    var body = plainPts.concat(example ? [example] : []).concat([proQ, disc]).join('\n\n')
    var tagName = yv ? '#yourvest' : '#' + (norm(name).replace(/ /g, '') || 'brand')
    var hashtags = tags.concat([tagName, fin ? '#educazionefinanziaria' : '#consigli']).filter(function (h, i, a) { return a.indexOf(h) === i }).slice(0, 5)
    var cta = pick(yv && !fin ? ['Segui Yourv€$t per altri spiegoni in 30 secondi: link in bio.', 'Ti è servito? Salva il post e segui Yourv€$t.'] : yv ? ['Tieni tutto sotto controllo con Yourv€$t: link in bio.', 'Vuoi vederlo sui tuoi numeri? Yourv€$t, link in bio.', 'Salva il post e prova Yourv€$t: link in bio.'] : ['Scopri ' + name + ': link in bio.', 'Salva il post e scopri ' + name + ': link in bio.'], 4)
    var script = !TEXT_KINDS[kind] ? [
      { label: 'HOOK', seconds: 3, text: hook },
      { label: 'CONTESTO', seconds: 7, text: plainPts[0] },
      { label: 'VALORE', seconds: 10, text: plainPts.slice(1, 3).join(' ') },
      { label: 'ESEMPIO', seconds: 6, text: example || plainPts[3] || proQ },
      { label: 'CTA', seconds: 4, text: ctaSpeech }] : []
    return { config: config, draft: { titles: [0, 1, 2].map(function (k) { return hash(hooks[(seed + k) % hooks.length]) }), body: body, script: script, cta: cta, hashtags: hashtags } }
  }

  /* ---------- samples: one per mode (presets in the editor, data for selfCheck) ---------- */
  var SAMPLES = {
    race: RACE_SAMPLE,
    explainer: {
      format: '9:16', mode: 'explainer', sector: 'ETF • GUIDA BASE', brand: { name: 'Yourv€$t' }, headerSubtitle: 'ETF a distribuzione o ad accumulo?',
      intro: { tag: 'YOURV€$T • SPIEGONE', title: 'DISTRIBUZIONE vs ACCUMULO', subtitle: 'LA DIFFERENZA IN 30 SECONDI', description: 'Stesso ETF, due versioni. Cambia cosa succede ai dividendi, e alle tasse.', playLabel: 'GUARDA' },
      chapters: [
        { accent: 'a', pill: 'DISTRIBUZIONE', scene: 'distribuzione', q: 'Cosa fa un ETF a distribuzione?', title: 'I dividendi arrivano sul conto.', html: 'Un ETF a <span class="hl-a">distribuzione</span> ti versa i dividendi: li incassi e paghi subito il <span class="hl-gold">26%</span> di tasse.', speech: 'Cosa fa un ETF a distribuzione? Ti versa i dividendi sul conto. Li incassi, e paghi subito il ventisei per cento di tasse.' },
        { accent: 'b', pill: 'ACCUMULO', scene: 'accumulo', q: 'E uno ad accumulo?', title: 'I dividendi restano nel fondo.', html: 'Un ETF ad <span class="hl-b">accumulo</span> li reinveste da solo: niente tasse sui dividendi finché non vendi.', speech: 'E uno ad accumulo? Li reinveste da solo. Niente tasse sui dividendi finché non vendi.' },
        { accent: 'gold', pill: 'NEL TEMPO', scene: 'interesse', big: '+ TEMPO', q: 'Perché nel tempo cambia tanto?', title: 'Reinvestire fa lavorare l’interesse composto.', html: 'Su molti anni la differenza si vede: i dividendi reinvestiti <span class="hl-gold">producono altri rendimenti</span>.', speech: 'Perché nel tempo cambia tanto? Perché i dividendi reinvestiti producono altri rendimenti.' },
        { accent: 'a', pill: 'A CHI SERVE', scene: 'obiettivo', q: 'A cosa serve l’uno e a cosa l’altro?', title: 'Rendita oggi o crescita domani.', html: 'La <span class="hl-a">distribuzione</span> dà un’entrata periodica; l’<span class="hl-b">accumulo</span> fa crescere il capitale e rimanda le tasse.', speech: 'A cosa serve l’uno e a cosa l’altro? La distribuzione dà un’entrata periodica, l’accumulo fa crescere il capitale e rimanda le tasse.' }],
      provocation: { line1: 'Sai già quali dei tuoi ETF <span class="hl-a">distribuiscono</span>?', line2: 'E quante tasse hai pagato <span class="inline-block">QUEST’ANNO</span> sui dividendi?', speech: 'Sai già quali dei tuoi ETF distribuiscono? E quante tasse hai pagato quest’anno sui dividendi?' },
      cta: { badge: 'Tutti i tuoi ETF, in un posto solo.', subtitle: 'Yourv€$t mette insieme i tuoi investimenti, con il fisco italiano già fatto:', button: 'Link in bio', speech: 'Con Yourvest vedi tutti i tuoi ETF in un posto solo. Link in bio.' },
      disclaimer: 'Informazione generale, non consulenza finanziaria o fiscale.',
    },
    list: {
      format: '9:16', mode: 'list', sector: 'ETF • CHECKLIST', brand: { name: 'Yourv€$t' }, headerSubtitle: '3 controlli prima di comprare un ETF',
      intro: { title: '3 CONTROLLI PRIMA DI UN ETF', subtitle: 'BASTANO 2 MINUTI', description: 'Tre cose da guardare nella scheda del fondo, sempre.' },
      chapters: [
        { big: '1', caption: 'Il costo annuo (TER)', pill: 'COSTI', title: 'Quanto ti costa ogni anno.', html: 'Il <span class="hl-a">TER</span> si paga ogni anno, anche quando il mercato scende.', speech: 'Primo: il TER, il costo annuo. Si paga ogni anno, anche quando il mercato scende.' },
        { big: '2', caption: 'Cosa replica davvero', pill: 'INDICE', title: 'Quale indice segue.', html: 'Mondo, Europa, un solo settore: <span class="hl-b">l’indice</span> decide quanto sei diversificato.', speech: 'Secondo: quale indice replica. Decide quanto sei diversificato.' },
        { big: '3', caption: 'Distribuzione o accumulo', pill: 'DIVIDENDI', title: 'Cosa fa con i dividendi.', html: 'Te li versa o li reinveste? Cambia <span class="hl-gold">quando paghi le tasse</span>.', speech: 'Terzo: se distribuisce o accumula i dividendi. Cambia quando paghi le tasse.' }],
      provocation: { line1: 'Hai controllato queste tre cose', line2: 'per <span class="hl-gold">tutti</span> i tuoi ETF?' },
      cta: { badge: 'I tuoi ETF, tutti in un colpo d’occhio.', speech: 'Con Yourvest li vedi tutti insieme. Link in bio.' },
      disclaimer: 'Informazione generale, non consulenza finanziaria.',
    },
    growth: {
      format: '9:16', mode: 'growth', sector: 'PAC • ESEMPIO', brand: { name: 'Yourv€$t' }, headerSubtitle: '200 € al mese per 20 anni • esempio ipotetico al 5% annuo',
      chartWatermark: 'VALORE DEL PAC • ESEMPIO IPOTETICO',
      intro: { title: '200 € AL MESE', subtitle: 'PER 20 ANNI', description: 'Un esempio ipotetico per vedere come lavora il tempo.' },
      series: { a: { name: 'PAC 200 €/MESE', ticker: 'PAC', color: '#38BDF8', subLabel: 'Ipotesi 5% annuo costante' } },
      unit: { prefix: '€', negativePrefix: '-€', suffix: '', decimals: 0, higherIsBetter: true },
      data: [0, 5036, 10601, 16750, 23557, 31056, 39329, 48499, 58627, 69817, 82207].map(function (v, i) { return { label: 'A' + i * 2, fullDate: 'Anno ' + i * 2, a: v } }),
      milestones: [{ idx: 5, label: '10 anni • €31.000', target: 'a' }, { idx: 10, label: '20 anni • €82.000', target: 'a' }],
      chapters: [
        { startIdx: 0, endIdx: 4, pill: 'ANNI 0–8', title: 'All’inizio sembra poco.', html: 'Nei primi anni conta quasi solo quello che <span class="hl-a">versi tu</span>.', speech: 'All’inizio sembra poco: conta quasi solo quello che versi tu.' },
        { startIdx: 5, endIdx: 7, pill: 'ANNI 10–14', title: 'Poi la curva si piega.', html: 'I rendimenti iniziano a produrre <span class="hl-gold">altri rendimenti</span>.', speech: 'Poi la curva si piega: i rendimenti producono altri rendimenti.' },
        { startIdx: 8, endIdx: 10, pill: 'ANNI 16–20', accent: 'gold', title: '48.000 € versati, 82.000 € nell’esempio.', html: 'Nell’ipotesi, oltre <span class="hl-gold">34.000 €</span> arrivano dal tempo, non dai versamenti.', speech: 'Quarantottomila euro versati, ottantaduemila nell’esempio: oltre trentaquattromila arrivano dal tempo.' }],
      provocation: { line1: 'Il tempo non si recupera.', line2: 'Sai quanto stai versando <span class="inline-block">OGGI</span>?' },
      cta: { badge: 'Vedi i tuoi versamenti, mese per mese.', speech: 'Con Yourvest tieni sotto controllo i tuoi versamenti. Link in bio.' },
      disclaimer: 'Esempio ipotetico: 200 €/mese al 5% annuo costante, senza costi né tasse. Non è consulenza.',
    },
    ranking: {
      format: '9:16', mode: 'ranking', sector: 'COSTI • ESEMPIO', brand: { name: 'Yourv€$t' }, headerSubtitle: 'Costo annuo su 10.000 € investiti • calcolo ipotetico', chartWatermark: 'COSTO ANNUO SU 10.000 €',
      intro: { title: 'QUANTO TI COSTA UN FONDO?', subtitle: 'SU 10.000 € INVESTITI', description: 'Lo stesso capitale, quattro livelli di costo annuo.' },
      unit: { prefix: '€', suffix: '', decimals: 0, higherIsBetter: false },
      items: [{ name: 'TER 0,2%', value: 20 }, { name: 'TER 1%', value: 100 }, { name: 'TER 1,8%', value: 180 }, { name: 'TER 2,5%', value: 250 }],
      chapters: [
        { pill: '0,2%', title: 'Un ETF a basso costo.', html: 'Con lo <span class="hl-a">0,2%</span> paghi 20 € l’anno.', speech: 'Con lo zero virgola due per cento paghi venti euro l’anno.' },
        { pill: '1%', title: 'Cinque volte tanto.', html: 'All’<span class="hl-b">1%</span> sono 100 € l’anno.', speech: 'All’uno per cento sono cento euro l’anno.' },
        { pill: '1,8%', title: 'Quasi il doppio.', html: 'Con l’1,8% arrivi a <span class="hl-gold">180 €</span>.', speech: 'Con l’uno virgola otto per cento arrivi a centottanta euro.' },
        { pill: '2,5%', title: 'Ogni anno, anche quando perdi.', html: 'Al 2,5%: <span class="hl-gold">250 €</span> l’anno, qualunque cosa faccia il mercato.', speech: 'Al due virgola cinque per cento: duecentocinquanta euro l’anno, qualunque cosa faccia il mercato.' }],
      provocation: { line1: 'Sai quanto paghi tu', line2: 'di costi <span class="hl-gold">ogni anno</span>?' },
      cta: { badge: 'Il peso dei costi, sempre in vista.', speech: 'Yourvest ti mostra quanto pesano i costi. Link in bio.' },
      disclaimer: 'Calcolo ipotetico su 10.000 €, solo costo annuo del fondo. Non è consulenza finanziaria.',
    },
    stat: {
      format: '9:16', mode: 'stat', sector: 'COSTI • 30 ANNI', brand: { name: 'Yourv€$t' }, headerSubtitle: 'L’1% di costi in più, per 30 anni • esempio ipotetico',
      intro: { title: 'L’1% CHE NON VEDI', subtitle: 'IN 30 ANNI', description: '10.000 € investiti: al 6% annuo o al 5%, dopo i costi.' },
      chapters: [
        { big: '30 anni', caption: 'Stesso capitale: 10.000 €', q: 'Da dove si parte?', title: 'Lo stesso capitale.', html: 'Investi <span class="hl-a">10.000 €</span> e non tocchi nulla per 30 anni.', speech: 'Da dove si parte? Investi diecimila euro e non tocchi nulla per trent’anni.' },
        { big: '-25%', accent: 'gold', caption: 'Capitale finale con l’1% di costi in più', q: 'Quanto pesa un punto di costi?', title: 'Un punto di costi pesa un quarto.', html: 'Al 5% invece che al 6% il capitale finale è circa il <span class="hl-gold">25% più basso</span>.', speech: 'Quanto pesa un punto di costi? Al cinque per cento invece che al sei, il capitale finale è circa un quarto più basso.' },
        { big: '€14.216', accent: 'b', caption: 'La differenza nell’esempio', q: 'Quanto fa in euro?', title: 'Più di quanto avevi investito.', html: '<span class="hl-b">14.216 €</span> di differenza: più del capitale iniziale.', speech: 'Quanto fa in euro? Quattordicimila duecento euro di differenza: più del capitale iniziale.' }],
      provocation: { line1: 'Non è il mercato.', line2: 'Sono i <span class="hl-gold">costi</span> che non guardi.' },
      cta: { badge: 'Guarda quanto ti costano i tuoi fondi.', speech: 'Yourvest ti fa vedere quanto pesano i costi. Link in bio.' },
      disclaimer: 'Esempio ipotetico: 10.000 € al 6% e al 5% annuo composto per 30 anni. Non è consulenza.',
    },
    news: {
      format: '9:16', mode: 'news', sector: 'FISCO • NOVITÀ', brand: { name: 'Yourv€$t' }, headerSubtitle: 'Minusvalenze: le scadenze da segnare',
      intro: { title: 'MINUSVALENZE IN SCADENZA', subtitle: 'COSA SAPERE', description: 'Le perdite fiscali non durano per sempre.' },
      chapters: [
        { big: '4 anni', pill: 'SCADENZA', title: 'Si usano fino al 31 dicembre del quarto anno successivo.', html: 'Art. 68 TUIR: poi <span class="hl-gold">scadono</span>.', speech: 'Le minusvalenze si usano fino al trentuno dicembre del quarto anno successivo, poi scadono.' },
        { pill: 'COSA COMPENSANO', title: 'Solo contro redditi diversi, non contro i guadagni di ETF e fondi.', html: 'Azioni, obbligazioni, certificati: <span class="hl-a">sì</span>. Guadagni di ETF: <span class="hl-b">no</span>.', speech: 'Compensano solo redditi diversi, come azioni e obbligazioni, non i guadagni di ETF e fondi.' },
        { pill: 'IN YOURV€$T', title: 'Lo zainetto fiscale mostra ogni scadenza.', html: 'Le vedi in un posto solo, con la <span class="hl-gold">data di scadenza</span>.', speech: 'Nello zainetto fiscale di Yourvest vedi ogni scadenza.' }],
      provocation: { line1: 'Quante minusvalenze hai', line2: 'che scadono <span class="inline-block">QUEST’ANNO</span>?' },
      cta: { badge: 'Le tue scadenze fiscali, sotto controllo.', bonusText: '', speech: 'Prova Yourvest: beta su invito su yourvest punto it.' },
      disclaimer: 'Informazione generale, non consulenza fiscale.',
    },
  }

  var BANNED = /chiediti|le trovi|verifica tu|verifica le regole|non esiste una risposta|scelta giusta per tutti|dipende da cosa|dipende da te/i // non-answers
  /** Asserts over every mode and format; throws on the first failure. Runs in Node too (fake 2D context). */
  function selfCheck() {
    var ok = function (v, m) { if (!v) throw new Error('VideoEngine selfCheck: ' + m) }
    var fake = function (w, h) {
      var g = { addColorStop: function () {} }, fontPx = 10
      var ctx = { canvas: { width: w, height: h }, measureText: function (s) { return { width: String(s).length * fontPx * 0.55 } }, createLinearGradient: function () { return g }, createRadialGradient: function () { return g } }
      return new Proxy(ctx, {
        get: function (o, k) { return k in o ? o[k] : function () {} },
        set: function (o, k, v) { if (k === 'font') fontPx = parseFloat((String(v).match(/([\d.]+)px/) || [])[1]) || 10; o[k] = v; return true },
      })
    }
    MODES.forEach(function (m) {
      ok(SAMPLES[m], 'sample ' + m)
      var cfg = validate(SAMPLES[m])
      ok(cfg.mode === m, m + ' keeps its mode, got ' + cfg.mode)
      ok(cfg.chapters.length >= 1 && cfg.cta.features.length === 4 && cfg.disclaimer, m + ' complete')
      ok(JSON.stringify(validate(cfg)) === JSON.stringify(cfg), m + ' validate is idempotent')
      ;['9:16', '16:9', '1:1'].forEach(function (f) {
        var p = plan(Object.assign({}, cfg, { format: f }))
        ok(p.W === FORMATS[f].W && p.H === FORMATS[f].H && p.total > 8, m + ' ' + f + ' plan')
        for (var i = 1; i < p.segs.length; i++) ok(Math.abs(p.segs[i].start - p.segs[i - 1].end) < 1e-9, 'contiguous segments')
        var ctx = fake(p.W / 4, p.H / 4)
        for (var t = 0; t <= p.total + 0.01; t += p.total / 23) draw(ctx, p, t)
        draw(ctx, p, p.total)
        // every chapter with a question, at 2×: question line + answer drawn in every mode; speed halves the video
        var qc = Object.assign({}, cfg, { format: f, chapters: cfg.chapters.map(function (ch) { return Object.assign({}, ch, { q: 'Ma quindi quanto costa davvero?' }) }) })
        var p1 = plan(qc), p2 = plan(qc, { speed: 2 })
        ok(p1.chSegs.every(function (s) { return s.qd > 0 && s.qd <= s.dur * 0.45 }), m + ' ' + f + ' question delay')
        ok(Math.abs(p2.total - p1.total / 2) <= p1.total * 0.05 && p2.speed === 2, m + ' ' + f + ' speed 2 halves: ' + p1.total + ' → ' + p2.total)
        for (t = 0; t <= p2.total + 0.01; t += p2.total / 31) draw(ctx, p2, t)
      })
    })
    // q: optional, trimmed, kept by validate; speed: clamped, also from the config; given durations are final
    var vq = validate({ chapters: [{ q: '  Perché?  ', title: 'Perché sì.' }, { q: { x: 1 }, title: 'y' }] })
    ok(vq.chapters[0].q === 'Perché?' && !('q' in vq.chapters[1]) && /^Perché\? Perché sì/.test(vq.chapters[0].speech) && JSON.stringify(validate(vq)) === JSON.stringify(vq), 'q validated: ' + JSON.stringify(vq.chapters))
    ok(plan(SAMPLES.stat, { speed: 5 }).speed === 2 && plan(SAMPLES.stat, { speed: 0.3 }).speed === 1 && plan(Object.assign({}, SAMPLES.stat, { speed: 1.5 })).speed === 1.5 && plan(Object.assign({}, SAMPLES.stat, { speed: 1.5 }), { speed: 1 }).speed === 1, 'speed clamp and default')
    var d2 = plan(SAMPLES.race, { speed: 2, durations: { intro: 5, chapters: [4, 4, 4, 4], provocation: 6, cta: 7 } })
    ok(Math.abs(d2.total - (5 + 16 + FREEZE / 2 + 6 + 7)) < 1e-9, 'durations are final at any speed: ' + d2.total)
    ok(guess('Ma quanto rende davvero?', '', '') !== 'domanda' && validate({ mode: 'explainer', chapters: [{ title: 'a' }, { title: 'Quanto?', scene: 'domanda' }] }).chapters[1].scene !== 'domanda', 'the ? scene only as the hook')
    var race = plan(SAMPLES.race)
    ok(race.cfg.data.length === 17 && race.cfg.chapters.length === 4 && race.cfg.format === '9:16', 'owner preset read as race 9:16')
    ok(fidx(race, race.bodyEnd) === 16 && fidx(race, 0) === 0, 'race runs from the first to the last point')
    ok(locate(race, 0).seg.kind === 'intro' && locate(race, race.total).seg.kind === 'cta' && locate(race, race.bodyEnd + 0.1).seg.kind === 'freeze', 'locate')
    // broken AI output never breaks the video
    var bad = validate({ mode: 'race', format: '4:3', data: [{ a: 'x', b: '1,5' }, { a: 3 }, { label: 'fine', a: 9, b: 2 }], chapters: [{ startIdx: -5, endIdx: 99, html: '<b>ciao</b> <script>x</script>' }, { startIdx: 7 }], milestones: [{ idx: 99, label: 'oltre' }, { idx: 1 }], series: { a: { color: 'nope' }, b: { color: '#000' } } })
    ok(bad.format === '9:16' && bad.data[0].a === 0 && bad.data[0].b === 1.5 && bad.data[1].b === 1.5, 'numbers repaired')
    ok(bad.chapters.length === 1 && bad.chapters[0].startIdx === 0 && bad.chapters[0].endIdx === 2, 'chapters clamped: ' + JSON.stringify(bad.chapters))
    ok(bad.milestones.length === 1 && bad.milestones[0].idx === 2, 'milestones clamped')
    ok(bad.palette.a === '#38bdf8' && lum(bad.palette.b) >= 0.3, 'colours filled and brightened')
    ok(validate(null).mode === 'explainer' && validate('not json').chapters.length === 1 && validate({ mode: 'race', data: [{ a: 1 }] }).mode === 'explainer', 'garbage in, video out')
    var two = validate({ mode: 'race', data: [{ a: 0, b: 0 }, { a: 1, b: 2 }, { a: 2, b: 1 }, { a: 3, b: 5 }], chapters: [{ startIdx: 2, endIdx: 3 }, { startIdx: 0, endIdx: 0 }] })
    ok(two.chapters[0].startIdx === 0 && two.chapters[0].endIdx === 0 && two.chapters[1].startIdx === 1 && two.chapters[1].endIdx === 3, 'chapters sorted and contiguous')
    ok(validate({ chapters: [{ title: 'x'.repeat(300), html: 'parola '.repeat(80) }] }).chapters[0].title.length <= 70, 'long text cut')
    ok(plain(cutRich('<span class="hl-a">' + 'lungo '.repeat(60) + '</span>', 50)).length <= 52, 'cutRich')
    var rt = rich('Con <span class="hl-a">Apple</span>, ok <span class="inline-block px-2">PROPRIO OGGI</span>.')
    ok(rt.length === 6 && rt[1].col === 'a' && rt[2].t === ',' && !rt[2].gap && rt[3].gap && rt[4].chip && rt[4].t === 'PROPRIO OGGI' && rt[5].t === '.' && !rt[5].gap, 'rich text: ' + JSON.stringify(rt))
    ok(spoken('Il 26% su € 300') === 'Il 26 per cento su euro 300', 'speech has no symbols')
    var dur = plan(SAMPLES.race, { durations: { intro: 5, chapters: [4, 4, 4, 4], provocation: 6, cta: 7 } })
    ok(Math.abs(dur.total - (5 + 16 + FREEZE + 6 + 7)) < 1e-9 && dur.speech[0].kind === 'chapter' && dur.speech[0].at === 5, 'durations drive the timing')
    var fb = fromBeats({ title: 'ETF: distribuzione o accumulo?', brand: { name: 'Yourv€$t' }, beats: [{ text: 'ETF a distribuzione o ad accumulo?', screen: 'Quale scegli?' }, { text: 'Un ETF a distribuzione ti paga i dividendi', screen: 'Distribuzione' }, { text: 'Un ETF ad accumulo reinveste i dividendi', screen: 'Accumulo' }, { text: 'Prova Yourvest, link in bio', screen: 'Link in bio' }] })
    ok(fb.mode === 'explainer' && fb.chapters.length === 2 && fb.chapters[0].scene === 'distribuzione' && fb.chapters[1].scene === 'accumulo' && fb.cta.speech.indexOf('Prova') === 0, 'fromBeats: ' + JSON.stringify(fb.chapters.map(function (x) { return x.scene })))
    ok(parseBig('+1.153,8%').v === 1153.8 && parseBig('€14.216').v === 14216 && parseBig('-25%').pre === '-' && parseBig('niente') === null, 'parseBig')
    // fromTopic: [topic, expected entry id (null = generic), expected mode]; typos and a non-finance topic included
    var TOPICS = [
      ['differenza tra TER 0,15% e 1,5%', 'ter', 'race'], ['ETF a distribuzione o accumulo', 'distacc', 'explainer'], ['5 errori da evitare quando investi', 'errori', 'list'],
      ['interese conposto', 'composto', 'growth'], ['diferenza tra etf a distribuzzione e acumulo', 'distacc', 'explainer'], ['PAC da 300 euro al mese per 25 anni', 'pac', 'growth'],
      ['inflazzione e soldi fermi sul conto', 'inflazione', 'stat'], ['minusvalenze in scadenza', 'minusvalenze', 'news'], ['tassazione titoli di stato 12,5%', null, null],
      ['fondo pensione o TFR in azienda', 'previdenza', 'explainer'], ['bitcoin conviene?', 'cripto', 'list'], ['3 consigli per il fondo emergenze', 'emergenza', 'list'],
      ['come fare il pane in casa', null, 'list'], ['la storia del jazz', null, 'explainer'], ['Milan contro Inter', null, 'explainer'], ['rendimento 4% vs 7% in 30 anni', null, 'race'],
      ['10.000 euro al 5% per 15 anni', null, 'growth'], ['il 26% di tasse sui guadagni', 'tassazione', 'explainer'], ['oro bene rifugio', 'oro', 'explainer'],
      ['quando i mercati crollano', 'ribassi', 'explainer'], ['5 consigli per imparare a suonare la chitarra', null, 'list']]
    var ctx0 = fake(270, 480)
    TOPICS.forEach(function (tc) {
      var e0 = pickTopic(tc[0]), r0 = fromTopic(tc[0], { brand: { name: 'Yourv€$t' } }), r1 = fromTopic(tc[0], { brand: { name: 'Yourv€$t' }, seed: 1 }), cf = r0.config, d = r0.draft, w = tc[0] + ': '
      if (tc[1] !== null || tc[2] === null) ok(tc[1] === null ? true : e0 && e0.id === tc[1], w + 'topic ' + (e0 && e0.id))
      if (tc[1] === null && tc[2] !== null) ok(!e0, w + 'expected generic, got ' + (e0 && e0.id))
      if (tc[2]) ok(cf.mode === tc[2], w + 'mode ' + cf.mode)
      ok(JSON.stringify(validate(cf)) === JSON.stringify(cf), w + 'passes validate unchanged')
      var p0 = plan(cf), kinds = p0.segs.map(function (sg) { return sg.kind }).join(' ')
      ok(/^intro( chapter)+ freeze provocation cta$/.test(kinds), w + '4 acts: ' + kinds)
      for (var t1 = 0; t1 <= p0.total; t1 += p0.total / 7) draw(ctx0, p0, t1)
      ok(cf.disclaimer && cf.chapters.length >= 2 && cf.cta.features.length === 4, w + 'complete')
      ok(d.titles.length === 3 && d.titles.every(function (x) { return x.length > 5 && x.indexOf('#') < 0 }) && d.body.length > 80 && d.cta && d.hashtags.length >= 3 && d.hashtags.length <= 5, w + 'draft ' + JSON.stringify(d.titles))
      ok(d.script.length === 5 && d.script.map(function (x) { return x.label }).join() === 'HOOK,CONTESTO,VALORE,ESEMPIO,CTA' && d.script.every(function (x) { return typeof x.seconds === 'number' && x.text }) && d.script.reduce(function (a, x) { return a + x.seconds }, 0) === 30, w + 'script')
      ok(JSON.stringify(r1) !== JSON.stringify(r0) && r1.draft.titles[0] !== d.titles[0] && JSON.stringify(validate(r1.config)) === JSON.stringify(r1.config), w + 'seed 1 differs')
      ok(JSON.stringify(fromTopic(tc[0], { brand: { name: 'Yourv€$t' } })) === JSON.stringify(r0), w + 'deterministic')
      ok(!/garantit|sicuramente|rendimento certo/i.test(d.body + JSON.stringify(cf)) || /garantiti e guru/.test(d.body), w + 'no promises')
      if (e0 && e0.tax) ok(/Informazione generale, non consulenza fiscale\.$/.test(cf.disclaimer) && /Informazione generale, non consulenza fiscale\.$/.test(d.body), w + 'tax disclaimer')
      if (cf.data) ok(/ipotetic/i.test(cf.disclaimer) && /ipotetic/i.test(cf.headerSubtitle), w + 'example declared hypothetical')
      // answers, not questions: every chapter asks (q) and answers (title + text); nothing sends the viewer elsewhere
      ok(cf.chapters.every(function (ch) { return ch.q && ch.title && ch.title !== ch.q && ch.speech.indexOf(ch.q.slice(0, 12)) >= 0 }), w + 'q + answer in every chapter')
      ok(!BANNED.test(JSON.stringify(cf.chapters) + JSON.stringify(d.script) + d.body), w + 'no "chiediti / le trovi / verifica tu"')
      ok(cf.chapters.every(function (ch, i) { return !i || ch.scene !== 'domanda' }), w + 'no ? scene after the hook')
    })
    // the knowledge base itself: a question per point, no non-answers
    KB.forEach(function (e) {
      ok(e.p.every(function (p) { return /\?$/.test(p[0]) && p[1] && p[2] && !/\?$/.test(p[1]) && (!p[3] || META[p[3]]) }), 'KB ' + e.id + ' points are question + answer')
      ok(!BANNED.test(JSON.stringify(e)), 'KB ' + e.id + ' has no non-answers')
    })
    // comparisons: the two subjects, not the request's verbs
    ;[['confrontami l’andamento del settore immobiliare a Roma e Milano negli ultimi 20 anni', 'Roma|Milano'], ['Roma vs Milano', 'Roma|Milano'], ['differenza tra Roma e Milano', 'Roma|Milano'], ['Roma o Milano: dove conviene comprare casa?', 'Roma|Milano'],
      ['Milan contro Inter', 'Milan|Inter'], ['fondo pensione o TFR in azienda', 'fondo pensione|TFR'], ['rendimento 4% vs 7% in 30 anni', '4%|7%'], ['confronta Apple e Microsoft', 'Apple|Microsoft'], ['inflazzione e soldi fermi sul conto', ''], ['come fare il pane in casa', '']].forEach(function (tc) {
      var pr = pairOf(tc[0]); ok((pr ? pr.join('|') : '') === tc[1], 'pairOf ' + tc[0] + ': ' + pr)
    })
    var rm = fromTopic('confrontami l’andamento del settore immobiliare a Roma e Milano negli ultimi 20 anni').config
    ok(rm.intro.title === 'ROMA vs MILANO' && !/CONFRONT/i.test(rm.intro.title + rm.sector + rm.headerSubtitle) && rm.mode === 'explainer' && rm.chapters.length === 4 && /fonti pubbliche/i.test(rm.disclaimer) && /ipotetic/i.test(rm.disclaimer) && /20 anni/.test(rm.chapters[0].q) && /^Milano/.test(rm.chapters[0].title) && /5\.300/.test(rm.chapters[0].html), 'Roma e Milano: ' + rm.intro.title + ' / ' + rm.chapters[0].q)
    var ic = fromTopic('spiegami cos’è l’interesse composto').config
    ok(pickTopic('spiegami cos’è l’interesse composto').id === 'composto' && ic.mode === 'growth' && ic.chapters.every(function (ch) { return ch.q && /\d/.test(ch.title + ch.html) }), 'interesse composto: q + figures in the answers')
    // a script with questions: the question becomes q, the next beat its answer (scene and figure from the answer)
    var fq = fromBeats({ title: 'Interesse composto', beats: [{ text: 'Sai cos’è l’interesse composto?' }, { text: 'Cos’è l’interesse composto?' }, { text: 'Sono interessi che fanno altri interessi: 10.000 euro al 5% diventano 43.000 in 30 anni.' }, { text: 'E se aspetti dieci anni?' }, { text: 'Ne perdi quasi la metà.' }, { text: 'Prova Yourvest, link in bio' }] })
    ok(fq.chapters.length === 2 && fq.chapters[0].q === 'Cos’è l’interesse composto?' && fq.chapters[0].scene === 'interesse' && /10\.000/.test(fq.chapters[0].big) && fq.chapters[1].q === 'E se aspetti dieci anni?' && fq.chapters[1].scene !== 'domanda', 'fromBeats pairs questions: ' + JSON.stringify(fq.chapters.map(function (x) { return [x.q, x.scene, x.big] })))
    // the TER case against a hand calculation: 10.000 € at 6% gross minus TER for 20 years → 10000·1,0585^20 ≈ 31.176, 10000·1,045^20 ≈ 24.117
    var ter = fromTopic('differenza tra TER 0,15% e 1,5%').config, lastP = ter.data[ter.data.length - 1]
    ok(lastP.label === 'A20' && lastP.a === 31176 && lastP.b === 24117 && ter.series.a.name === 'TER 0,15%' && ter.series.b.name === 'TER 1,5%', 'TER maths: ' + JSON.stringify(lastP))
    ok(fromTopic('PAC 200 euro al mese al 5% per 20 anni').config.data.slice(-1)[0].a === 82207, 'PAC maths matches the growth sample')
    ok(fromTopic('interese conposto con 200 euro al mese per 20 anni').config.data.slice(-1)[0].a === 82207, 'a monthly amount is a PAC')
    // every Crea kind: draft fields always present; text kinds have an empty script, video and unknown kinds a 30 s one
    ;['reel', 'storia', 'post', 'carosello', 'thread', 'linkedin', 'newsletter', 'qualcosa-di-nuovo', ''].forEach(function (kd) {
      var dk = fromTopic('ETF a distribuzione o accumulo', { kind: kd, seed: 2.7, format: '1:1' }), dd = dk.draft
      ok(Array.isArray(dd.titles) && dd.titles.length === 3 && typeof dd.body === 'string' && dd.body && Array.isArray(dd.script) && typeof dd.cta === 'string' && Array.isArray(dd.hashtags) && dk.config.format === '1:1', 'kind ' + kd + ' fields')
      ok(dd.script.length === ({ post: 1, carosello: 1, thread: 1, linkedin: 1, newsletter: 1 }[kd] ? 0 : 5), 'kind ' + kd + ' script')
    })
    ok(JSON.stringify(fromTopic('ETF', { seed: 2.7 })) === JSON.stringify(fromTopic('ETF', { seed: 2 })) && fromTopic('').config.chapters.length >= 2 && fromTopic(null, { seed: -3 }).draft.titles.length === 3, 'seed integer, empty topic')
    ok(/Yourv/.test(fromTopic('come fare il pane in casa').config.cta.features[0].title + fromTopic('come fare il pane in casa').config.cta.subtitle) || fromTopic('come fare il pane in casa').config.cta.features[0].title === FEATURES_YV[0].title, 'Yourv€$t CTA by default')
    return true
  }

  var api = {
    version: 2, formats: FORMATS, modes: MODES, modeNames: MODE_NAME,
    scenes: IDS.map(function (id) { return { id: id, name: META[id][0] } }),
    validate: validate, plan: plan, draw: draw, locate: locate, fromBeats: fromBeats, fromTopic: fromTopic, guess: guess, numberIn: numberIn, plain: plain,
    samples: SAMPLES, selfCheck: selfCheck,
  }
  if (typeof window !== 'undefined') window.VideoEngine = api
  if (typeof module !== 'undefined') module.exports = api
})()
