import type {
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  ISeriesApi,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { VolumeProfileData } from '../types';

class VolumeProfilePaneRenderer implements IPrimitivePaneRenderer {
  private _data: VolumeProfileData | null = null;
  private _series: ISeriesApi<'Candlestick'> | null = null;

  setData(data: VolumeProfileData | null, series: ISeriesApi<'Candlestick'> | null) {
    this._data = data;
    this._series = series;
  }

  draw(target: CanvasRenderingTarget2D) {
    if (!this._data || !this._series) return;
    const data = this._data;
    const series = this._series;
    const POC = data.poc;
    const MAX_WIDTH_FRACTION = 0.25;

    target.useMediaCoordinateSpace(scope => {
      const ctx = scope.context;
      const paneWidth = scope.mediaSize.width;
      if (paneWidth <= 0) return;
      const maxBarWidth = paneWidth * MAX_WIDTH_FRACTION;

      for (const bin of data.bins) {
        if (!bin || typeof bin.volume !== 'number' || bin.volume <= 0) continue;
        const y = series.priceToCoordinate(bin.price);
        if (y === null || !Number.isFinite(y)) continue;
        const width = data.max_vol > 0 ? (bin.volume / data.max_vol) * maxBarWidth : 0;
        if (width < 0.5) continue;
        const x = paneWidth - width;
        let color = 'rgba(242, 54, 69, 0.30)';
        if (bin.poc) color = 'rgba(255, 152, 0, 0.85)';
        else if (POC === null || bin.price >= POC) color = 'rgba(8, 153, 129, 0.30)';
        ctx.fillStyle = color;
        ctx.fillRect(x, y - 1, width, 2);
      }
    });
  }
}

class VolumeProfilePaneView implements IPrimitivePaneView {
  constructor(private readonly _renderer: VolumeProfilePaneRenderer) {}
  renderer(): IPrimitivePaneRenderer | null {
    return this._renderer;
  }
}

export class VolumeProfilePrimitive implements ISeriesPrimitive<Time> {
  private readonly _renderer = new VolumeProfilePaneRenderer();
  private readonly _paneView: IPrimitivePaneView = new VolumeProfilePaneView(this._renderer);
  private _series: ISeriesApi<'Candlestick'> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _data: VolumeProfileData | null = null;

  attached(param: SeriesAttachedParameter<Time>) {
    this._series = param.series as ISeriesApi<'Candlestick'>;
    this._requestUpdate = param.requestUpdate;
    this._renderer.setData(this._data, this._series);
  }

  paneViews(): ReadonlyArray<IPrimitivePaneView> {
    return [this._paneView];
  }

  setData(data: VolumeProfileData | null) {
    this._data = data;
    this._renderer.setData(data, this._series);
    if (this._requestUpdate) this._requestUpdate();
  }
}
