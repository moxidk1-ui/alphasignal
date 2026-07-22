import {
  computeATR,
  computeBollingerBands,
  computeEMA,
  computeMACD,
  computeRSI,
  computeVolumeSMA,
  detectLiquidityLevels,
  detectMarketStructure,
  findFairValueGaps,
  findOrderBlocks,
  findSwingHighs,
  findSwingLows,
} from "@alphasignal/indicators";
import type { Candle, ComputedIndicators } from "@alphasignal/shared";

export function computeFullIndicators(candles: Candle[]): ComputedIndicators {
  return {
    ema9: computeEMA(candles, 9),
    ema21: computeEMA(candles, 21),
    ema50: computeEMA(candles, 50),
    ema200: computeEMA(candles, 200),
    rsi14: computeRSI(candles, 14),
    macd: computeMACD(candles, 12, 26, 9),
    atr14: computeATR(candles, 14),
    volumeSma20: computeVolumeSMA(candles, 20),
    bollingerBands: computeBollingerBands(candles, 20, 2),
    swingHighs: findSwingHighs(candles, 3),
    swingLows: findSwingLows(candles, 3),
    orderBlocks: findOrderBlocks(candles),
    fairValueGaps: findFairValueGaps(candles),
    marketStructure: detectMarketStructure(candles),
    liquidityLevels: detectLiquidityLevels(candles),
  };
}
