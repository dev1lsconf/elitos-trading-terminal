import type {
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  ISeriesApi,
  ITimeScaleApi,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { FVGBox } from '../types';

class FVGPaneRenderer implements IPrimitivePaneRenderer {
  private _boxes: FVGBox[] | null = null;
  private _series: ISeriesApi<'Line'> | null = null;
  private _timeScale: ITimeScaleApi<Time> | null = null;

  setData(boxes: FVGBox[] | null, series: ISeriesApi<'Line'> | null, timeScale: ITimeScaleApi<Time> | null) {
    this._boxes = boxes;
    this._series = series;
    this._timeScale = timeScale;
  }

  draw(target: CanvasRenderingTarget2D) {
    if (!this._boxes || !this._series || !this._timeScale) return;
    const boxes = this._boxes;
    const series = this._series;
    const timeScale = this._timeScale;

    target.useMediaCoordinateSpace(scope => {
      const ctx = scope.context;

      for (const box of boxes) {
        if (!box || typeof box.start !== 'number') continue;
        const x0 = timeScale.timeToCoordinate(box.start as Time);
        const x1 = timeScale.timeToCoordinate(box.end as Time);
        const y0 = series.priceToCoordinate(box.top);
        const y1 = series.priceToCoordinate(box.bottom);
        if (x0 === null || x1 === null || y0 === null || y1 === null) continue;
        if (!Number.isFinite(x0) || !Number.isFinite(x1) || !Number.isFinite(y0) || !Number.isFinite(y1)) continue;
        const width = x1 - x0;
        const height = y1 - y0;
        if (width < 2 || Math.abs(height) < 2) continue;

        ctx.fillStyle = box.direction === 'bullish' ? 'rgba(8, 153, 129, 0.16)' : 'rgba(242, 54, 69, 0.16)';
        ctx.fillRect(x0, y0, width, height);
        ctx.strokeStyle = box.direction === 'bullish' ? 'rgba(8, 153, 129, 0.55)' : 'rgba(242, 54, 69, 0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x0, y0, width, height);
      }
    });
  }
}

class FVGPaneView implements IPrimitivePaneView {
  constructor(private readonly _renderer: FVGPaneRenderer) {}
  renderer(): IPrimitivePaneRenderer | null {
    return this._renderer;
  }
}

export class FVGPrimitive implements ISeriesPrimitive<Time> {
  private readonly _renderer = new FVGPaneRenderer();
  private readonly _paneView: IPrimitivePaneView = new FVGPaneView(this._renderer);
  private _series: ISeriesApi<'Line'> | null = null;
  private _timeScale: ITimeScaleApi<Time> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _boxes: FVGBox[] | null = null;

  attached(param: SeriesAttachedParameter<Time>) {
    this._series = param.series as ISeriesApi<'Line'>;
    this._timeScale = param.chart.timeScale();
    this._requestUpdate = param.requestUpdate;
    this._renderer.setData(this._boxes, this._series, this._timeScale);
  }

  paneViews(): ReadonlyArray<IPrimitivePaneView> {
    return [this._paneView];
  }

  setData(boxes: FVGBox[] | null) {
    this._boxes = boxes;
    this._renderer.setData(boxes, this._series, this._timeScale);
    if (this._requestUpdate) this._requestUpdate();
  }
}
