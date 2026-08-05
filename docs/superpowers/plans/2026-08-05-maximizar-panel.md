# Maximizar Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a single chart panel to be maximized within the app (filling the entire grid area) and restored, via a header button, double-click on the chart, and the Esc key.

**Architecture:** `App.tsx` owns a `maximizedPanelId: string | null` state. When set, App renders only that panel inside a 1×1 grid occupying full height; when null, the normal grid renders. `ChartPanel` receives `isMaximized` and `onMaximize` props, renders a toggle button (⛶/✕), and calls `onMaximize` on double-click of its chart container. No changes to the lightweight-charts instance are needed since `autoSize: true` already resizes the widget.

**Tech Stack:** React 19 + TypeScript (strict, no `any`), Vite, Tailwind CSS, lightweight-charts v5.2, Playwright (Edge) for E2E verification.

## Global Constraints

- No `any` types. Use `unknown` with guards or Zod-style validation (project rule).
- No `console.log` left in source (except `console.error` in try/catch) (project rule).
- Do NOT modify `backend/` (read-only).
- No git repository exists in this project — **skip all commit steps**; use the verification command at the end of each task instead.
- All existing `verify-final.mjs` tests must keep passing (22/22 currently).
- Comment language in code: Spanish, only where a comment is genuinely needed (match existing style).
- Existing file patterns must be followed: named exports, functional components with hooks, Tailwind utility classes, `#131722`/`#1E222D`/`#2A2A4A`/`#787B86` palette.
- Dev server runs at `http://localhost:5001` (Vite, port 5001 proxying Flask 5000). Run `npm run build` before final verification.
- The grid selector is a `<select>` in the header (options `1`/`2`/`4`/`6`/`8`), styled with the panel palette. `GRID_OPTIONS` in `src/types.ts` defines `{ value, label, cols, rows }`.
- `DEFAULT_PANEL_CONFIG` and `PanelConfig` live in `src/types.ts`; `PanelConfig.id` is `string` (`panel-0` … `panel-7`).

---

### Task 1: App state, render logic and Esc handler

**Files:**
- Modify: `src/App.tsx:7-25` (state + handlers), `src/App.tsx:159-179` (grid render)

**Interfaces:**
- Produces:
  - `maximizedPanelId: string | null` state in `App`.
  - `handleMaximize(panelId: string | null)` — toggles: if `panelId === maximizedPanelId` → `setMaximizedPanelId(null)`, else → `setMaximizedPanelId(panelId)`.
  - `ChartPanel` is rendered with new props `isMaximized={maximizedPanelId === panel.id}` and `onMaximize={() => handleMaximize(panel.id)}` for every panel.
  - When `maximizedPanelId !== null`, the `<main>` grid renders a single `ChartPanel` for the maximized panel in a 1-column/1-row grid; otherwise the existing `gridConfig` grid renders.

- [ ] **Step 1: Add state and toggle handler**

In `src/App.tsx`, after `const [syncTimeframes, setSyncTimeframes] = useState(false);` add:

```tsx
const [maximizedPanelId, setMaximizedPanelId] = useState<string | null>(null);
```

After `const handleGlobalTimeframeChange = ...` add:

```tsx
const handleMaximize = useCallback((panelId: string | null) => {
  setMaximizedPanelId(prev => (prev === panelId ? null : panelId));
}, []);
```

- [ ] **Step 2: Add Esc listener**

Add a `useEffect` after the `handleGlobalTimeframeChange` definition (inside the `App` component, after `const handleGlobalTimeframeChange = ...;`):

```tsx
useEffect(() => {
  if (maximizedPanelId === null) return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setMaximizedPanelId(null);
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [maximizedPanelId]);
```

- [ ] **Step 3: Conditional grid render**

Replace the grid `<main>` block in `src/App.tsx` (currently lines ~158-179):

```tsx
      {/* Grid de gráficos */}
      <main className="p-2 flex-1 min-h-0 overflow-hidden">
        <div
          className="h-full grid gap-2 trading-grid"
          style={{
            gridTemplateColumns: `repeat(${maximizedPanelId !== null ? 1 : gridConfig.cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${maximizedPanelId !== null ? 1 : gridConfig.rows}, minmax(0, 1fr))`,
          }}
        >
          {maximizedPanelId !== null
            ? panels
                .filter(p => p.id === maximizedPanelId)
                .map(panel => (
                  <ChartPanel
                    key={panel.id}
                    config={panel}
                    isMaximized
                    onMaximize={() => handleMaximize(panel.id)}
                    onSymbolChange={(symbol) => handleSymbolChange(panel.id, symbol)}
                    onTimeframeChange={(tf) => handleTimeframeChange(panel.id, tf)}
                    onMarketChange={(market) => handleMarketChange(panel.id, market)}
                    onIndicatorToggle={(ind, val) => handleIndicatorToggle(panel.id, ind, val)}
                    style={{ minWidth: 0, minHeight: 0 }}
                  />
                ))
            : panels.slice(0, gridLayout).map((panel) => (
                <ChartPanel
                  key={panel.id}
                  config={panel}
                  isMaximized={false}
                  onMaximize={() => handleMaximize(panel.id)}
                  onSymbolChange={(symbol) => handleSymbolChange(panel.id, symbol)}
                  onTimeframeChange={(tf) => handleTimeframeChange(panel.id, tf)}
                  onMarketChange={(market) => handleMarketChange(panel.id, market)}
                  onIndicatorToggle={(ind, val) => handleIndicatorToggle(panel.id, ind, val)}
                  style={{ minWidth: 0, minHeight: 0 }}
                />
              ))}
        </div>
      </main>
```

Note: this step will not compile yet because `ChartPanel` does not accept `isMaximized`/`onMaximize` props (Task 2 adds them). TypeScript errors here are expected until Task 2 completes.

- [ ] **Step 4: Verify no runtime regressions**

Run: `npm run build`
Expected: FAILS at type-check on the new `isMaximized`/`onMaximize` props (expected — Task 2 completes the interface). Confirm the failure is ONLY about these two props, not anything else.

---

### Task 2: ChartPanel props, toggle button and double-click

**Files:**
- Modify: `src/components/ChartPanel.tsx:30-39` (props interface + destructure), `src/components/ChartPanel.tsx:515-562` (header JSX + chart container)

**Interfaces:**
- Consumes: `isMaximized: boolean` and `onMaximize: () => void` props from Task 1.
- Produces:
  - `ChartPanel` accepts `isMaximized?: boolean` and `onMaximize: () => void`.
  - Header renders a toggle button with `data-testid="maximize-toggle"` and `aria-label` of `'Maximizar'` or `'Restaurar'` depending on `isMaximized`.
  - Chart container `<div ref={containerRef}>` gets `onDoubleClick={onMaximize}`.

- [ ] **Step 1: Extend props interface**

Replace `interface ChartPanelProps { ... }` and the function signature destructure:

```tsx
interface ChartPanelProps {
  config: PanelConfig;
  onSymbolChange: (symbol: string) => void;
  onTimeframeChange: (tf: PanelConfig['timeframe']) => void;
  onMarketChange: (market: PanelConfig['market']) => void;
  onIndicatorToggle: (indicator: keyof PanelConfig['indicators'], value: boolean) => void;
  onMaximize: () => void;
  isMaximized?: boolean;
  style?: React.CSSProperties;
}

export function ChartPanel({ config, onSymbolChange, onTimeframeChange, onMarketChange, onIndicatorToggle, onMaximize, isMaximized = false, style }: ChartPanelProps) {
```

- [ ] **Step 2: Add toggle button in header**

In the header JSX, immediately before the `{/* Indicators menu button */}` block (around line 560), add:

```tsx
        {/* Maximizar panel */}
        <button
          data-testid="maximize-toggle"
          onClick={onMaximize}
          className="p-1.5 rounded hover:bg-[#1E222D] transition-colors"
          aria-label={isMaximized ? 'Restaurar' : 'Maximizar'}
          title={isMaximized ? 'Restaurar' : 'Maximizar'}
        >
          {isMaximized ? (
            <svg className="w-4 h-4 text-[#787B86]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V5a2 2 0 00-2-2H5a2 2 0 00-2 2v2a2 2 0 002 2h4zm6 0h4a2 2 0 002-2V5a2 2 0 00-2-2h-2a2 2 0 00-2 2v4zM9 15H5a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-4zm6 0v4a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2h-4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-[#787B86]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V6a2 2 0 012-2h2M20 8V6a2 2 0 00-2-2h-2M4 16v2a2 2 0 002 2h2M20 16v2a2 2 0 01-2 2h-2" />
            </svg>
          )}
        </button>
```

- [ ] **Step 3: Add double-click on the chart container**

Replace the chart container div (around line 565):

```tsx
      {/* Chart container */}
      <div ref={containerRef} onDoubleClick={onMaximize} className="flex-1 w-full min-h-0" />
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run build`
Expected: PASS (type-check and vite build succeed).

- [ ] **Step 5: Manual smoke check against the running dev server**

Run: `npm run dev` (if not already running on port 5001) then open `http://localhost:5001`. Confirm: a ⛶ icon appears in each panel header; clicking it shows only that panel filling the grid; clicking ✕ or pressing Esc restores the full grid.

---

### Task 3: E2E tests for maximize in verify-final.mjs

**Files:**
- Modify: `verify-final.mjs` (append new test block before the final `console.log('ERRORES DE CONSOLA:'...)`)

**Interfaces:**
- Consumes: `data-testid="maximize-toggle"`, `aria-label` values `'Maximizar'`/`'Restaurar'`, `main .rounded-lg` selector, `header select` grid selector — all produced in Tasks 1-2.

- [ ] **Step 1: Add a helper to set grid via the select**

Add after the existing `chartFits()` helper:

```js
async function setGrid(value) {
  await page.selectOption('header select', String(value));
  await page.waitForTimeout(3000);
}
```

- [ ] **Step 2: Add the maximize test block**

Insert the following block just before the line `console.log('ERRORES DE CONSOLA:', ...)`:

```js
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
```

- [ ] **Step 3: Run the full verification suite**

Run: `node verify-final.mjs`
Expected: ALL tests PASS, including the new maximize tests, with `ERRORES DE CONSOLA: ninguno`. If any fail, inspect the specific assertion before continuing.

- [ ] **Step 4: Screenshot of maximized state (evidence)**

Add after the restore in the new block (end of Step 2 code):

```js
await page.locator('button[data-testid="maximize-toggle"]').first().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: 'verify_maximized.png' });
await page.locator('button[data-testid="maximize-toggle"]').first().click();
await page.waitForTimeout(2500);
```

Re-run `node verify-final.mjs` and confirm `verify_maximized.png` is created.

---

### Task 4: Final build + regression verification

**Files:**
- No source changes.

- [ ] **Step 1: Run the production build**

Run: `npm run build`
Expected: PASS (tsc -b and vite build succeed). The existing `INEFFECTIVE_DYNAMIC_IMPORT` warning about `api.ts` is pre-existing and acceptable.

- [ ] **Step 2: Run the full E2E suite one final time**

Run: `node verify-final.mjs`
Expected: ALL tests PASS (22 original + 7 new maximize tests), `ERRORES DE CONSOLA: ninguno`.

**Self-Review Notes (updated after pre-flight conflict fix):**
- **Spec coverage:** All spec requirements map to tasks: state in App (Task 1), conditional 1×1 render (Task 1), header toggle button ⛶/✕ (Task 2), double-click on chart container (Task 2), Esc restore (Task 1), single maximized at a time via toggle logic (Task 1), header controls remain visible/functional (Task 2 keeps header mounted), tests for button/dblclick/Esc/symbol-change/any-panel-maximizable (Task 3). Out-of-scope items (browser fullscreen, drag-resize, persistence) are not implemented.
- **Placeholders:** None — every step has concrete code or commands.
- **Type consistency:** `isMaximized?: boolean`, `onMaximize: () => void`, `maximizedPanelId: string | null`, `handleMaximize(panelId: string | null)` are consistent across Tasks 1-3. The `data-testid="maximize-toggle"` used by tests matches Task 2 exactly.
- **Known unreachable behavior (user-approved):** Because only the maximized panel is rendered (option A), a user cannot click another panel's button while one is maximized — the "replace A with B while maximized" spec line is not reachable via UI and was removed from the spec. The test now verifies any panel can be maximized via maximize → restore → maximize another.

- [ ] **Step 3: Clean up any stray debug artifacts**

Check the project root with `Get-ChildItem -Name *.mjs,*.png` — only `verify-final.mjs` and the `verify_*.png` screenshots should remain. Delete any `debug-*.mjs` or stray screenshots if present.

---

## Self-Review Notes

- **Spec coverage:** All spec requirements map to tasks: state in App (Task 1), conditional 1×1 render (Task 1), header toggle button ⛶/✕ (Task 2), double-click on chart container (Task 2), Esc restore (Task 1), single maximized at a time via toggle logic (Task 1), header controls remain visible/functional (Task 2 keeps header mounted), tests for button/dblclick/Esc/symbol-change/alternating (Task 3). Out-of-scope items (browser fullscreen, drag-resize, persistence) are not implemented.
- **Placeholders:** None — every step has concrete code or commands.
- **Type consistency:** `isMaximized?: boolean`, `onMaximize: () => void`, `maximizedPanelId: string | null`, `handleMaximize(panelId: string | null)` are consistent across Tasks 1-3. The `data-testid="maximize-toggle"` used by tests matches Task 2 exactly.
