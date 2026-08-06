import { chromium } from 'playwright-core';

const executablePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push(`PAGEERROR: ${err.message}`));

let failures = 0;
const report = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures++;
};

async function countColor(selector, [r, g, b], tol = 40) {
  return page.evaluate(({ selector, r, g, b, tol }) => {
    const el = document.querySelector(selector);
    if (!el) return 0;
    for (const c of el.querySelectorAll('canvas')) {
      try {
        const ctx = c.getContext('2d');
        if (!ctx) continue;
        const img = ctx.getImageData(0, 0, c.width, c.height).data;
        let count = 0;
        for (let i = 0; i < img.length; i += 4) {
          if (Math.abs(img[i] - r) < tol && Math.abs(img[i + 1] - g) < tol && Math.abs(img[i + 2] - b) < tol) count++;
        }
        if (count > 60) return count;
      } catch {}
    }
    return 0;
  }, { selector, r, g, b, tol });
}

async function toggleIndicator(label) {
  const btn = page.locator('button[aria-label="Indicadores"]').first();
  const isOpen = await page.locator('div.absolute.right-0.top-full').first().isVisible().catch(() => false);
  if (!isOpen) {
    await btn.click();
    await page.waitForTimeout(250);
  }
  await page.locator('label', { hasText: label }).first().click();
  await page.waitForTimeout(1800);
  await btn.click();
  await page.waitForTimeout(150);
}

async function panelsInfo() {
  return page.evaluate(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const panels = [...document.querySelectorAll('main .rounded-lg')];
    return {
      count: panels.length,
      visible: panels.filter(el => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.left >= 0 && r.bottom <= vh + 1 && r.right <= vw + 1 && r.width > 50 && r.height > 50;
      }).length,
      first: panels[0] ? Math.round(panels[0].getBoundingClientRect().width) : 0,
    };
  });
}

// Verifica que el chart (canvas) esté contenido dentro del panel y llene su ancho
async function chartFits() {
  return page.evaluate(() => {
    const panel = document.querySelector('main .rounded-lg');
    if (!panel) return { fits: false, reason: 'no panel' };
    const widget = panel.querySelector('.tv-lightweight-charts');
    if (!widget) return { fits: false, reason: 'no chart widget' };
    const pr = panel.getBoundingClientRect();
    const cr = widget.getBoundingClientRect();
    const cw = Math.round(cr.width), pw = Math.round(pr.width), ch = Math.round(cr.height), ph = Math.round(pr.height);
    const contained = cw <= pw + 2 && ch <= ph + 2;
    const fillsWidth = Math.abs(cw - pw) <= 4;
    return { fits: contained, fillsWidth, cw, pw, ch, ph };
  });
}

async function setGrid(value) {
  await page.selectOption('header select', String(value));
  await page.waitForTimeout(3000);
}

await page.goto('http://localhost:5001', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(4000);

const info = await panelsInfo();
report(info.count === 1, `grid default = 1 (count=${info.count})`);

const fit1 = await chartFits();
report(fit1.fits && fit1.fillsWidth, `chart llena panel grid=1 (cw=${fit1.cw}, pw=${fit1.pw}, ch=${fit1.ch})`);

const SEL = 'main .rounded-lg';
const H_MID = 0.4;   // la banda inferior del panel empieza a partir del 40% de altura
const H_BOTTOM = 1.0;

// ---- Modo compare: línea de % cambio (reemplaza las velas) ----
const CYAN = [38, 198, 218]; // #26C6DA
async function compareSeriesInfo(panelId) {
  return page.evaluate((id) => {
    const s = window.__elitosSeries?.[id] ?? null;
    if (!s) return null;
    let opts = null;
    try { opts = s.options(); } catch {}
    let last = null;
    try { last = s.dataByIndex?.(s.data().length - 1); } catch {}
    let seriesType = null;
    try { seriesType = s.seriesType(); } catch {}
    return { priceFormat: opts?.priceFormat, last: last?.value ?? null, seriesType };
  }, panelId);
}

// 1) La línea compare (cyan) debe estar presente
report((await countColor(SEL, CYAN)) > 12, 'compare: linea principal cyan presente');

// 2) La serie principal es una Line (no Candlestick) → no hay cuerpos de vela
{
  const info = await compareSeriesInfo('panel-0');
  report(!!info && info.seriesType === 'Line', `compare: serie principal es Line (${info?.seriesType ?? 'n/a'})`);
}

// 3) La serie principal usa priceFormat percent
{
  const info = await compareSeriesInfo('panel-0');
  report(!!info && info.priceFormat?.type === 'percent', `compare: priceFormat=percent (${info?.priceFormat?.type ?? 'n/a'})`);
}

// 4) El último valor corresponde al % de cambio vs la primera vela del dataset
{
  const res = await fetch('http://localhost:5001/api/stocks?symbol=AAPL&interval=1d');
  const j = await res.json();
  const closes = (j.candles ?? []).map(c => c.close);
  const expected = (closes[closes.length - 1] / closes[0] - 1) * 100;
  const info = await compareSeriesInfo('panel-0');
  const diff = info && info.last != null ? Math.abs(info.last - expected) : Infinity;
  report(!!info && info.last != null && diff < 0.05, `compare: ultimo valor = % cambio (last=${info?.last?.toFixed(2) ?? 'n/a'}, expected=${expected.toFixed(2)})`);
}

// Volumen: ON por defecto → toggle OFF → el histograma (verde compuesto ~#0F4B48) desaparece.
// tol=8 para evitar falsos positivos de la antialias de la línea cyan compare.
const volBefore = await countColor(SEL, [15, 75, 72], 8);
await toggleIndicator('Volumen');
const volAfter = await countColor(SEL, [15, 75, 72], 8);
report(volBefore > 60 && volAfter < 60, `Volumen toggle (before=${volBefore}, after=${volAfter})`);
await toggleIndicator('Volumen'); // volver a ON

// Volumen: el histograma debe ocupar la mitad inferior del panel (separado del precio).
// tol=8 para evitar la antialias de la línea cyan; el verde #0F4B48 del volumen está abajo.
{
  const geom = await page.evaluate(({ H_MID, H_BOTTOM }) => {
    const panel = document.querySelector('main .rounded-lg');
    const widget = panel.querySelector('.tv-lightweight-charts');
    const canvas = widget.querySelectorAll('canvas')[0];
    const W = canvas.width, H = canvas.height;
    const img = canvas.getContext('2d').getImageData(0, 0, W, H).data;
    let volumeMinRow = -1, volumeMaxRow = -1;
    for (let y = 0; y < H; y++) {
      let volCnt = 0;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const r = img[i], g = img[i + 1], b = img[i + 2];
        if (Math.abs(r - 15) < 8 && Math.abs(g - 75) < 8 && Math.abs(b - 72) < 8) volCnt++;
      }
      if (volCnt > 3) {
        if (volumeMinRow < 0) volumeMinRow = y;
        volumeMaxRow = y;
      }
    }
    return { volumeMinRow, volumeMaxRow, volTopPct: +(volumeMinRow / H).toFixed(3), volBottomPct: +(volumeMaxRow / H).toFixed(3), ok: volumeMinRow > 0 && (volumeMinRow / H) > H_MID && (volumeMaxRow / H) <= H_BOTTOM };
  }, { H_MID, H_BOTTOM });
  report(geom.ok, `Volumen en la mitad inferior (volTop=${geom.volTopPct}, volBottom=${geom.volBottomPct})`);
}

// VWAP (naranja #FF9800)
await toggleIndicator('VWAP');
report((await countColor(SEL, [255, 152, 0])) > 0, 'VWAP line (orange)');

// Bollinger (morado #A97AFF)
await toggleIndicator('Bandas Bollinger');
report((await countColor(SEL, [169, 122, 255])) > 0, 'Bollinger bands (purple)');

// RSI (azul #2962FF) en sub-pane
await toggleIndicator('RSI (14)');
report((await countColor(SEL, [41, 98, 255])) > 0, 'RSI sub-pane (blue)');

// MACD (azul #2962FF)
await toggleIndicator('MACD (12,26,9)');
report((await countColor(SEL, [41, 98, 255])) > 0, 'MACD sub-pane (blue line)');

// Williams %R (magenta #E91E63)
await toggleIndicator('Williams %R (14)');
report((await countColor(SEL, [233, 30, 99])) > 0, 'Williams sub-pane (magenta)');

// Volume Profile (POC naranja #FF9800)
await toggleIndicator('Volume Profile (VAH/VAL/POC)');
report((await countColor(SEL, [255, 152, 0])) > 0, 'Volume Profile POC line (orange)');

// FVG (flechas verdes #089981)
await toggleIndicator('Fair Value Gap (FVG)');
report((await countColor(SEL, [8, 153, 129])) > 0, 'FVG markers (green arrows)');

await page.screenshot({ path: 'verify_all_indicators.png' });

// Grids 2/4/6/8 a 1920px — los charts deben adaptarse y caber en sus paneles
for (const g of [2, 4, 6, 8]) {
  await page.selectOption('header select', String(g));
  await page.waitForTimeout(3000);
  const gi = await panelsInfo();
  report(gi.count === g && gi.visible === g, `grid=${g} (${gi.visible}/${gi.count} visibles)`);
  const fit = await chartFits();
  report(fit.fits, `grid=${g} chart cabe en panel (cw=${fit.cw}, pw=${fit.pw}, ch=${fit.ch})`);
}
await page.screenshot({ path: 'verify_grid_8.png' });

// Grid 8 a 900px (paneles deben seguir visibles)
await page.setViewportSize({ width: 900, height: 700 });
await page.waitForTimeout(2500);
const g900 = await panelsInfo();
report(g900.visible === g900.count, `grid=8 @900px (${g900.visible}/${g900.count} visibles)`);

// Responsive móvil: 1 columna (breakpoint <=767px → ancho completo)
await page.setViewportSize({ width: 700, height: 1000 });
await page.waitForTimeout(2500);
const mob = await panelsInfo();
report(mob.first > 400, `mobile 1 columna (count=${mob.first})`);

// Menú de indicadores debe quedar por ENCIMA de los paneles de abajo (grid=4, viewport pequeño)
await page.setViewportSize({ width: 1366, height: 768 });
await page.selectOption('header select', '4');
await page.waitForTimeout(2500);
await page.locator('button[aria-label="Indicadores"]').first().click();
await page.waitForTimeout(300);
const menuOnTop = await page.evaluate(() => {
  const dropdown = document.querySelector('div.absolute.right-0.top-full');
  if (!dropdown) return false;
  const r = dropdown.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2);
  const y = Math.round(r.bottom - 6);
  const el = document.elementFromPoint(x, y);
  let node = el;
  for (let i = 0; i < 5 && node; i++) {
    if (node === dropdown || node.className?.includes?.('w-56')) return true;
    node = node.parentElement;
  }
  return false;
});
report(menuOnTop, `menu de indicadores sobre paneles inferiores (grid=4 @1366x768)`);
await page.screenshot({ path: 'verify_menu_top.png' });
await page.screenshot({ path: 'verify_mobile.png' });

// Cerrar el menú de indicadores (el dropdown abierto suma un .rounded-lg extra a main)
await page.locator('button[aria-label="Indicadores"]').first().click();
await page.waitForTimeout(300);

// ---- Maximizar panel (dentro de la app) ----
await page.setViewportSize({ width: 1920, height: 1080 });
await setGrid(4);

// Maximizar por botón → solo 1 panel visible y ocupa todo el grid
await page.locator('button[data-testid="maximize-toggle"]').first().click();
await page.waitForTimeout(2500);
const maxBtn = await panelsInfo();
report(maxBtn.count === 1 && maxBtn.visible === 1, `maximizar botón: solo 1 panel (count=${maxBtn.count}, visible=${maxBtn.visible})`);
const maxFit = await chartFits();
report(maxFit.fits && maxFit.fillsWidth && maxFit.pw > 1200, `maximizar botón: panel ocupa grid (pw=${maxFit.pw})`);

// Cambiar símbolo estando maximizado
const symbolInput = page.locator('input[type="text"]').first();
await symbolInput.fill('MSFT');
await symbolInput.press('Enter');
await page.waitForTimeout(2000);
const maxStill = await panelsInfo();
report(maxStill.visible === 1, `cambiar símbolo en maximizado sigue 1 panel (visible=${maxStill.visible})`);

// Restaurar con botón ✕
await page.locator('button[data-testid="maximize-toggle"]').first().click();
await page.waitForTimeout(2500);
const restored = await panelsInfo();
report(restored.count === 4 && restored.visible === 4, `restaurar botón: grid completo (count=${restored.count}, visible=${restored.visible})`);

// Maximizar por doble clic en el gráfico
await page.locator('main .rounded-lg .tv-lightweight-charts').first().dblclick();
await page.waitForTimeout(2500);
const dbl = await panelsInfo();
report(dbl.visible === 1, `doble clic maximiza (visible=${dbl.visible})`);

// Esc restaura
await page.keyboard.press('Escape');
await page.waitForTimeout(2500);
const escRestored = await panelsInfo();
report(escRestored.count === 4 && escRestored.visible === 4, `Esc restaura grid (count=${escRestored.count}, visible=${escRestored.visible})`);

// Cualquier panel puede maximizarse: maximizar panel 0 → restaurar → maximizar panel 1
await page.locator('button[data-testid="maximize-toggle"]').nth(0).click();
await page.waitForTimeout(2000);
await page.locator('button[data-testid="maximize-toggle"]').first().click();
await page.waitForTimeout(2000);
await page.locator('button[data-testid="maximize-toggle"]').nth(1).click();
await page.waitForTimeout(2000);
const secondMax = await panelsInfo();
report(secondMax.visible === 1, `otro panel puede maximizarse (visible=${secondMax.visible})`);
await page.locator('button[data-testid="maximize-toggle"]').first().click();
await page.waitForTimeout(2000);

await page.locator('button[data-testid="maximize-toggle"]').first().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: 'verify_maximized.png' });
await page.locator('button[data-testid="maximize-toggle"]').first().click();
await page.waitForTimeout(2500);

// ---- Zoom por defecto del gráfico (auto-zoom según ancho del panel) ----
async function visibleRange(panelId) {
  return page.evaluate((id) => {
    const charts = window.__elitosCharts ?? {};
    const ch = charts[id];
    if (!ch) return null;
    const r = ch.timeScale().getVisibleLogicalRange();
    if (!r) return null;
    return { from: r.from, to: r.to, count: r.to - r.from };
  }, panelId);
}

async function totalBars(symbol, interval) {
  const res = await fetch(`http://localhost:5001/api/stocks?symbol=${symbol}&interval=${interval}`);
  const json = await res.json();
  return (json.candles ?? []).length;
}

// grid=4 (2x2, panel ~948px) con AAPL 1h (~170 velas): últimas ~floor(ancho/9), no todas
await setGrid(4);
await page.locator('main .rounded-lg select').nth(1).selectOption('1h');
await page.waitForTimeout(2500);
const symZoom = page.locator('input[type="text"]').first();
await symZoom.fill('AAPL');
await symZoom.press('Enter');
await page.waitForTimeout(3000);
const total1h = await totalBars('AAPL', '1h');
const panelW = (await panelsInfo()).first;
const expected = Math.floor(panelW / 9);
const r1h = await visibleRange('panel-0');
report(!!r1h && r1h.count < total1h, `zoom default: menos velas que el total (visible=${r1h ? Math.round(r1h.count) : 'n/a'}, total=${total1h})`);
report(!!r1h && Math.abs(r1h.count - expected) <= 3, `zoom default: velas ≈ ancho/9 (visible=${r1h ? Math.round(r1h.count) : 'n/a'}, expected=${expected})`);
report(!!r1h && r1h.to >= total1h - 3, `zoom default: último bar pegado al borde derecho (to=${r1h ? Math.round(r1h.to) : 'n/a'}, total=${total1h})`);

// Alternar Volumen no debe resetear el zoom
const beforeToggle = (await visibleRange('panel-0'))?.count ?? 0;
await toggleIndicator('Volumen');
const afterToggleOn = (await visibleRange('panel-0'))?.count ?? 0;
report(Math.abs(afterToggleOn - beforeToggle) <= 1, `zoom default: toggle indicador no resetea (before=${Math.round(beforeToggle)}, after=${Math.round(afterToggleOn)})`);
await toggleIndicator('Volumen'); // volver a OFF

// grid=1 (panel ~1900px) con AAPL 1d (~65 velas): caben todas → fitContent
await setGrid(1);
await page.locator('main .rounded-lg select').nth(1).selectOption('1d');
await page.waitForTimeout(2500);
const total1d = await totalBars('AAPL', '1d');
const r1d = await visibleRange('panel-0');
report(!!r1d && r1d.from <= 1 && r1d.count >= total1d - 2, `zoom default: grid=1 1d muestra todo (visible=${r1d ? Math.round(r1d.count) : 'n/a'}, total=${total1d})`);

// La última vela debe quedar pegada al borde derecho (sin franja vacía derecha).
// Regresión: rightOffset:2 dejaba ~2 slots vacíos tras la última vela (hasta ~178px en 1M).
async function rightMarginInfo(tf) {
  const res = await fetch(`http://localhost:5001/api/stocks?symbol=AAPL&interval=${tf}`);
  const j = await res.json();
  const n = (j.candles ?? []).length;
  return page.evaluate((n) => {
    const panel = document.querySelector('main .rounded-lg');
    const widget = panel.querySelector('.tv-lightweight-charts');
    const canvas = widget.querySelectorAll('canvas')[0];
    const W = canvas.width;
    const ts = window.__elitosCharts?.['panel-0']?.timeScale();
    if (!ts) return null;
    const xLast = ts.logicalToCoordinate(n - 1);
    const xPrev = ts.logicalToCoordinate(n - 2);
    if (xLast == null || xPrev == null) return null;
    return { W, xLast, spacing: Math.abs(xLast - xPrev) };
  }, n);
}

for (const tf of ['1h', '1w', '1M', '1d']) {
  await page.locator('main .rounded-lg select').nth(1).selectOption(tf);
  await page.waitForTimeout(2500);
  const rm = await rightMarginInfo(tf);
  const rightEmpty = rm ? rm.W - 1 - rm.xLast : null;
  const ratio = rm && rm.spacing > 0 ? rightEmpty / rm.spacing : null;
  report(!!rm && ratio != null && ratio <= 1.5, `sin franja vacia derecha ${tf} (rightEmpty=${rightEmpty != null ? Math.round(rightEmpty) : 'n/a'}px, spacing=${rm ? Math.round(rm.spacing) : 'n/a'}px, ratio=${ratio?.toFixed(2)})`);
}

await page.screenshot({ path: 'verify_default_zoom.png' });

// ---- Refresco automático de los paneles (cada 10s) ----
async function chartMeta(panelId) {
  return page.evaluate((id) => window.__elitosChartMeta?.[id] ?? null, panelId);
}

// En dev el refresh corre siempre, aunque el mercado esté cerrado
const meta0 = await chartMeta('panel-0');
report(!!meta0 && meta0.refreshCount >= 1, `refresh: hook expone refreshCount (count=${meta0 ? meta0.refreshCount : 'n/a'})`);
const refreshCountBefore = meta0?.refreshCount ?? 0;
const tsBefore = meta0?.lastUpdated ?? 0;

await page.waitForTimeout(11500); // cubre al menos un tick de refresh (10s)

const meta1 = await chartMeta('panel-0');
report((meta1?.refreshCount ?? 0) > refreshCountBefore, `refresh: el contador incrementa tras ~11s (before=${refreshCountBefore}, after=${meta1 ? meta1.refreshCount : 'n/a'})`);
report((meta1?.lastUpdated ?? 0) > tsBefore, `refresh: lastUpdated se actualiza (before=${tsBefore}, after=${meta1 ? meta1.lastUpdated : 'n/a'})`);

// El badge de mercado debe reflejar el estado real (fetchMarketStatus), no ser
// pisado por un refresh de datos (cada 10s)
const realUsStatus = (await (await fetch('http://localhost:5001/api/market-status')).json()).us;
const badge = await page.locator('main .rounded-lg span', { hasText: /^(Live|Closed)$/ }).first().textContent({ timeout: 3000 }).catch(() => null);
report(!!badge && badge.trim() === realUsStatus, `refresh: el badge de mercado coincide con el estado real (badge=${badge?.trim() ?? 'n/a'}, real=${realUsStatus})`);

// El header del panel-0 debe mostrar el último precio (close de la última vela), no solo en crypto.
// Regresión: al pasar velas→compare el lastPrice solo se setea para crypto; los stocks quedaban sin precio.
{
  const res = await fetch('http://localhost:5001/api/stocks?symbol=AAPL&interval=1d');
  const j = await res.json();
  const lastClose = (j.candles ?? []).at(-1)?.close ?? null;
  const priceText = await page.locator('main .rounded-lg span').filter({ has: page.locator('span.font-mono') }).first().textContent({ timeout: 3000 }).catch(() => null);
  const priceTexts = await page.locator('main .rounded-lg span.font-mono').allTextContents({ timeout: 3000 }).catch(() => []);
  const priceNum = (priceTexts ?? []).map(t => parseFloat(t.replace(/[^\d.,]/g, '').replace(',', ''))).find(n => Number.isFinite(n) && n > 0);
  const diff = priceNum != null && lastClose != null ? Math.abs(priceNum - lastClose) : Infinity;
  report(!!priceNum && lastClose != null && diff < 0.01, `header: muestra ultimo precio (price=${priceNum ?? 'n/a'}, expected=${lastClose ?? 'n/a'})`);
}

// Aplicar un zoom custom vía dev hook: debe preservarse tras un refresh
await page.evaluate((id) => {
  const ch = window.__elitosCharts?.[id];
  if (ch) ch.timeScale().setVisibleLogicalRange({ from: 10, to: 40 });
}, 'panel-0');
await page.waitForTimeout(500);
const customRange = await visibleRange('panel-0');

await page.waitForTimeout(11500); // cubre otro tick de refresh (10s)

const rangeAfter = await visibleRange('panel-0');
report(!!customRange && !!rangeAfter && Math.abs(rangeAfter.from - customRange.from) <= 1 && Math.abs(rangeAfter.to - customRange.to) <= 1,
  `refresh: el zoom custom se preserva tras el refresh (from=${rangeAfter ? Math.round(rangeAfter.from) : 'n/a'}, to=${rangeAfter ? Math.round(rangeAfter.to) : 'n/a'})`);

// Timestamp 'Últ. act.' en el header del panel-0
const lastActBefore = await page.locator('main .rounded-lg span', { hasText: 'Últ. act.' }).first().textContent({ timeout: 3000 }).catch(() => null);
report(!!lastActBefore && /Últ\. act\. \d{1,2}:\d{2}:\d{2}/.test(lastActBefore), `refresh: timestamp 'Últ. act.' visible (text=${lastActBefore?.trim() ?? 'n/a'})`);

await page.waitForTimeout(11500); // cubre otro tick de refresh (10s)

const lastActAfter = await page.locator('main .rounded-lg span', { hasText: 'Últ. act.' }).first().textContent({ timeout: 3000 }).catch(() => null);
report(!!lastActBefore && !!lastActAfter && lastActBefore.trim() !== lastActAfter.trim(), 'refresh: el timestamp se actualiza tras el refresh');

await page.screenshot({ path: 'verify_refresh.png' });

console.log('ERRORES DE CONSOLA:', errors.length ? errors.join('\n') : 'ninguno');
if (errors.length) failures++;
await browser.close();
console.log(failures === 0 ? 'RESULTADO: TODOS LOS TESTS PASAN' : `RESULTADO: ${failures} TEST(S) FALLARON`);
process.exit(failures === 0 ? 0 : 1);
