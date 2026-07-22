import {
  detectLiquidityLevels,
  detectMarketStructure,
  findFairValueGaps,
  findOrderBlocks,
  findSwingHighs,
  findSwingLows,
} from "@alphasignal/indicators";
import type {
  Candle,
  ComputedIndicators,
  DetectionInput,
  Direction,
  FairValueGap,
  KeyLevels,
  LiquidityLevel,
  Market,
  OrderBlock,
  PatternDetectionResult,
  SignalStrategy,
  SwingPoint,
  Timeframe,
} from "@alphasignal/shared";

export type PatternType = Exclude<SignalStrategy, "AI_HYBRID" | "MANUAL" | "CUSTOM">;

interface DetectionContext {
  candles: Candle[];
  indicators: ComputedIndicators;
  timeframe: Timeframe;
  market: Market;
  ticker: string;
  lastIndex: number;
  last: Candle;
  previous: Candle;
  atr: number;
  rsi: number;
  previousRsi: number;
  macd: { macd: number; signal: number; histogram: number };
  previousMacd: { macd: number; signal: number; histogram: number };
  ema9: number;
  ema21: number;
  ema50: number;
  ema200: number;
  averageVolume20: number;
}

interface Zone {
  type: "supply" | "demand";
  low: number;
  high: number;
  startIndex: number;
  touchCount: number;
}

interface TradingRange {
  startIndex: number;
  endIndex: number;
  low: number;
  high: number;
  mid: number;
  height: number;
}

const ALGO_PATTERNS = new Set<PatternType>([
  "ICT_SILVER_BULLET",
  "ICT_TURTLE_SOUP",
  "ICT_OB_FVG",
  "ICT_BOS_CHOCH",
  "ICT_LIQUIDITY_SWEEP",
  "WYCKOFF_SPRING",
  "WYCKOFF_UPTHRUST",
  "WYCKOFF_ACCUMULATION",
  "WYCKOFF_DISTRIBUTION",
  "MOMENTUM_EMA_CROSS",
  "MOMENTUM_RSI_DIV",
  "MOMENTUM_MACD",
  "PA_BREAKER_BLOCK",
  "PA_SUPPLY_DEMAND",
  "PA_DOUBLE_TOP_BOTTOM",
]);

export function runDetection(input: DetectionInput): PatternDetectionResult[] {
  if (input.candles.length < 8) {
    return [];
  }

  const context = createContext(input);
  const detections: PatternDetectionResult[] = [];

  for (const pattern of input.enabledPatterns) {
    if (!ALGO_PATTERNS.has(pattern as PatternType)) {
      continue;
    }

    const detection = runDetector(pattern as PatternType, context);
    if (detection) {
      detections.push(detection);
    }
  }

  return detections
    .filter((detection) => detection.confidence >= 1 && detection.confidence <= 100)
    .sort((left, right) => right.confidence - left.confidence);
}

function runDetector(pattern: PatternType, context: DetectionContext): PatternDetectionResult | null {
  switch (pattern) {
    case "ICT_SILVER_BULLET":
      return detectIctSilverBullet(context);
    case "ICT_TURTLE_SOUP":
      return detectIctTurtleSoup(context);
    case "ICT_OB_FVG":
      return detectIctOrderBlockFvg(context);
    case "ICT_BOS_CHOCH":
      return detectIctBosChoch(context);
    case "ICT_LIQUIDITY_SWEEP":
      return detectIctLiquiditySweep(context);
    case "WYCKOFF_SPRING":
      return detectWyckoffSpring(context);
    case "WYCKOFF_UPTHRUST":
      return detectWyckoffUpthrust(context);
    case "WYCKOFF_ACCUMULATION":
      return detectWyckoffAccumulation(context);
    case "WYCKOFF_DISTRIBUTION":
      return detectWyckoffDistribution(context);
    case "MOMENTUM_EMA_CROSS":
      return detectMomentumEmaCross(context);
    case "MOMENTUM_RSI_DIV":
      return detectMomentumRsiDivergence(context);
    case "MOMENTUM_MACD":
      return detectMomentumMacd(context);
    case "PA_BREAKER_BLOCK":
      return detectPriceActionBreakerBlock(context);
    case "PA_SUPPLY_DEMAND":
      return detectPriceActionSupplyDemand(context);
    case "PA_DOUBLE_TOP_BOTTOM":
      return detectPriceActionDoubleTopBottom(context);
  }
}

function detectIctSilverBullet(context: DetectionContext): PatternDetectionResult | null {
  if (!isKillZone(context.last.time)) {
    return null;
  }

  const sweep = findRecentLiquiditySweep(context, 6);
  if (!sweep) {
    return null;
  }

  const gap = findImmediateFvg(context, sweep.index, sweep.direction);
  if (!gap) {
    return null;
  }

  const entry = gap.midpoint;
  const stopLoss =
    sweep.direction === "LONG"
      ? sweep.extreme - context.atr * 0.5
      : sweep.extreme + context.atr * 0.5;
  const targets = createTargets({
    direction: sweep.direction,
    entry,
    stopLoss,
    takeProfit3: nextStructureTarget(context, sweep.direction, entry),
  });

  return createDetection({
    pattern: "ICT_SILVER_BULLET",
    direction: sweep.direction,
    entry,
    stopLoss,
    targets,
    confidence: clampConfidence(
      68 +
        (hasRsiDivergence(context, sweep.direction) ? 10 : 0) +
        (emaAligned(context, sweep.direction) ? 10 : 0) +
        (isVolumeSpike(context, context.lastIndex, 1.2) ? 5 : 0),
    ),
    keyLevels: keyLevels(context, [sweep.level], [gap]),
    rationale: `${context.ticker} swept ${formatPrice(sweep.level)} and closed back inside the liquidity pool during a kill zone. A ${gap.type} fair value gap formed immediately after the sweep, giving a midpoint entry at ${formatPrice(entry)}.`,
    timestamp: context.last.time,
  });
}

function detectIctTurtleSoup(context: DetectionContext): PatternDetectionResult | null {
  const highs = context.indicators.swingHighs.length > 0 ? context.indicators.swingHighs : findSwingHighs(context.candles, 2);
  const lows = context.indicators.swingLows.length > 0 ? context.indicators.swingLows : findSwingLows(context.candles, 2);
  const reversal = findRecentTurtleSoupReversal(context, highs, lows);

  if (!reversal) {
    return null;
  }

  const stopLoss =
    reversal.direction === "LONG"
      ? reversal.extreme - context.atr * 0.25
      : reversal.extreme + context.atr * 0.25;
  const previousStructure = nextStructureTarget(context, reversal.direction, reversal.entry);
  const halfMove = Math.abs(previousStructure - reversal.entry) / 2;
  const targets = createTargets({
    direction: reversal.direction,
    entry: reversal.entry,
    stopLoss,
    takeProfit1:
      reversal.direction === "LONG" ? reversal.entry + halfMove : reversal.entry - halfMove,
    takeProfit2: previousStructure,
    takeProfit3: nextOpposingLiquidity(context, reversal.direction, reversal.entry) ?? previousStructure,
  });

  return createDetection({
    pattern: "ICT_TURTLE_SOUP",
    direction: reversal.direction,
    entry: reversal.entry,
    stopLoss,
    targets,
    confidence: clampConfidence(
      64 +
        (isKillZone(context.last.time) ? 15 : 0) +
        ((reversal.direction === "LONG" && context.rsi < 30) ||
        (reversal.direction === "SHORT" && context.rsi > 70)
          ? 10
          : 0),
    ),
    keyLevels: keyLevels(context, [reversal.level], []),
    rationale: `${context.ticker} breached the clean swing level at ${formatPrice(reversal.level)} and reclaimed it within the Turtle Soup reversal window. Entry is the reversal close at ${formatPrice(reversal.entry)} with invalidation beyond the liquidity grab.`,
    timestamp: context.last.time,
  });
}

function detectIctOrderBlockFvg(context: DetectionContext): PatternDetectionResult | null {
  const orderBlocks = context.indicators.orderBlocks.length > 0 ? context.indicators.orderBlocks : findOrderBlocks(context.candles);
  const gaps = context.indicators.fairValueGaps.length > 0 ? context.indicators.fairValueGaps : findFairValueGaps(context.candles);

  for (const block of orderBlocks.slice().reverse()) {
    const matchingGap = gaps
      .filter((gap) => gap.type === block.type)
      .find((gap) => Math.abs(gap.index - block.endIndex) <= 3 && zoneOverlap(block, gap));

    if (!matchingGap) {
      continue;
    }

    const overlap = overlapZone(block, matchingGap);
    const overlapRatio = (overlap.high - overlap.low) / Math.max(block.high - block.low, 0.000001);
    const returned = candleTouchesZone(context.last, overlap.low, overlap.high);
    if (!returned && context.lastIndex - block.endIndex > 10) {
      continue;
    }

    const direction: Direction = block.type === "bullish" ? "LONG" : "SHORT";
    const entry = midpoint(overlap.low, overlap.high);
    const stopLoss =
      direction === "LONG" ? block.low - context.atr * 0.25 : block.high + context.atr * 0.25;
    const targets = createTargets({
      direction,
      entry,
      stopLoss,
      rr1: 1.5,
      rr2: 2.5,
      takeProfit3: nextOpposingLiquidity(context, direction, entry),
    });

    return createDetection({
      pattern: "ICT_OB_FVG",
      direction,
      entry,
      stopLoss,
      targets,
      confidence: clampConfidence(
        62 + (overlapRatio > 0.5 ? 20 : 8) + (emaAligned(context, direction) ? 15 : 0),
      ),
      keyLevels: keyLevels(context, [entry], [matchingGap], [block]),
      rationale: `${context.ticker} returned to a ${block.type} order block and fair value gap overlap between ${formatPrice(overlap.low)} and ${formatPrice(overlap.high)}. The confluence zone defines entry while the order block extreme defines invalidation.`,
      timestamp: context.last.time,
    });
  }

  return null;
}

function detectIctBosChoch(context: DetectionContext): PatternDetectionResult | null {
  const structure = context.indicators.marketStructure ?? detectMarketStructure(context.candles);
  const latestBos = lastRecentEvent(structure.bos, context.lastIndex, 6);
  const latestChoch = lastRecentEvent(structure.choch, context.lastIndex, 6);
  const event = latestChoch ?? latestBos;

  if (!event) {
    return null;
  }

  const direction = event.direction;
  const entry = findNearestConfluenceEntry(context, direction, event.level) ?? event.level;
  const protectiveSwing = protectiveSwingLevel(context, direction);
  const stopLoss =
    direction === "LONG"
      ? protectiveSwing - context.atr * 0.25
      : protectiveSwing + context.atr * 0.25;
  const targets = createTargets({
    direction,
    entry,
    stopLoss,
    takeProfit3: nextOpposingLiquidity(context, direction, entry),
  });

  return createDetection({
    pattern: "ICT_BOS_CHOCH",
    direction,
    entry,
    stopLoss,
    targets,
    confidence: clampConfidence(
      60 + (isVolumeSpike(context, event.index, 1.5) ? 15 : 0) + (emaAligned(context, direction) ? 20 : 0),
    ),
    keyLevels: keyLevels(context, [event.level], []),
    rationale: `${context.ticker} printed a ${latestChoch ? "change of character" : "break of structure"} through ${formatPrice(event.level)}. Entry is anchored to the nearest retest or imbalance with risk beyond the prior structural swing.`,
    timestamp: context.candles[event.index]?.time ?? context.last.time,
  });
}

function detectIctLiquiditySweep(context: DetectionContext): PatternDetectionResult | null {
  const levels = context.indicators.liquidityLevels.length > 0
    ? context.indicators.liquidityLevels
    : detectLiquidityLevels(context.candles);

  for (let index = Math.max(2, context.lastIndex - 4); index <= context.lastIndex - 1; index += 1) {
    const sweep = sweepAtIndex(context, index, levels);
    if (!sweep) {
      continue;
    }

    const confirmation = context.candles[index + 1]!;
    if (!isReversalConfirmation(context.candles[index]!, confirmation, sweep.direction)) {
      continue;
    }

    const entry = confirmation.close;
    const stopLoss =
      sweep.direction === "LONG"
        ? sweep.extreme - context.atr * 0.25
        : sweep.extreme + context.atr * 0.25;
    const targets = createTargets({
      direction: sweep.direction,
      entry,
      stopLoss,
      takeProfit3: nextOpposingLiquidity(context, sweep.direction, entry),
    });

    return createDetection({
      pattern: "ICT_LIQUIDITY_SWEEP",
      direction: sweep.direction,
      entry,
      stopLoss,
      targets,
      confidence: clampConfidence(66 + (isStrongClose(confirmation, sweep.direction) ? 10 : 0)),
      keyLevels: keyLevels(context, [sweep.level], []),
      rationale: `${context.ticker} swept liquidity at ${formatPrice(sweep.level)} by at least half an ATR and closed back inside the range. The following candle confirmed reversal pressure, creating an entry at ${formatPrice(entry)}.`,
      timestamp: confirmation.time,
    });
  }

  return null;
}

function detectWyckoffSpring(context: DetectionContext): PatternDetectionResult | null {
  const range = identifyTradingRange(context.candles, context.lastIndex - 2, 15);
  if (!range) {
    return null;
  }

  const spring = context.candles[context.lastIndex - 1]!;
  const confirmation = context.last;
  const avgVolume = averageVolume(context.candles, context.lastIndex - 2, 20);
  const isSpring =
    spring.low < range.low &&
    spring.close > range.low &&
    spring.volume < avgVolume &&
    isBullish(confirmation) &&
    confirmation.volume > avgVolume;

  if (!isSpring) {
    return null;
  }

  const entry = confirmation.close;
  const stopLoss = spring.low - context.atr * 0.5;
  const targets = {
    takeProfit1: range.mid,
    takeProfit2: range.high,
    takeProfit3: range.high + range.height,
  };

  return createDetection({
    pattern: "WYCKOFF_SPRING",
    direction: "LONG",
    entry,
    stopLoss,
    targets,
    confidence: clampConfidence(72 + (confirmation.volume > avgVolume * 1.5 ? 8 : 0)),
    keyLevels: keyLevels(context, [range.low, range.mid, range.high], []),
    rationale: `${context.ticker} formed a Wyckoff spring below range support at ${formatPrice(range.low)} and immediately reclaimed the range. Bullish follow-through on above-average volume confirms absorption.`,
    timestamp: confirmation.time,
  });
}

function detectWyckoffUpthrust(context: DetectionContext): PatternDetectionResult | null {
  const range = identifyTradingRange(context.candles, context.lastIndex - 2, 15);
  if (!range) {
    return null;
  }

  const upthrust = context.candles[context.lastIndex - 1]!;
  const confirmation = context.last;
  const avgVolume = averageVolume(context.candles, context.lastIndex - 2, 20);
  const isUpthrust =
    upthrust.high > range.high &&
    upthrust.close < range.high &&
    upthrust.volume > avgVolume * 1.5 &&
    isBearish(confirmation) &&
    confirmation.volume > avgVolume;

  if (!isUpthrust) {
    return null;
  }

  const entry = confirmation.close;
  const stopLoss = upthrust.high + context.atr * 0.5;
  const targets = {
    takeProfit1: range.mid,
    takeProfit2: range.low,
    takeProfit3: range.low - range.height,
  };

  return createDetection({
    pattern: "WYCKOFF_UPTHRUST",
    direction: "SHORT",
    entry,
    stopLoss,
    targets,
    confidence: clampConfidence(72 + (confirmation.volume > avgVolume * 1.5 ? 8 : 0)),
    keyLevels: keyLevels(context, [range.low, range.mid, range.high], []),
    rationale: `${context.ticker} upthrust above resistance at ${formatPrice(range.high)} and failed back inside the range. Bearish follow-through confirms supply at the range high.`,
    timestamp: confirmation.time,
  });
}

function detectWyckoffAccumulation(context: DetectionContext): PatternDetectionResult | null {
  const sequence = findWyckoffAccumulationSequence(context);
  if (!sequence) {
    return null;
  }

  const entry = context.last.close;
  const stopLoss = sequence.secondaryTest.low - context.atr * 0.25;
  const target = sequence.automaticRally.high + (sequence.automaticRally.high - sequence.sellingClimax.low) * 1.5;
  const targets = createTargets({
    direction: "LONG",
    entry,
    stopLoss,
    takeProfit1: sequence.automaticRally.high,
    takeProfit2: midpoint(sequence.automaticRally.high, target),
    takeProfit3: target,
  });

  return createDetection({
    pattern: "WYCKOFF_ACCUMULATION",
    direction: "LONG",
    entry,
    stopLoss,
    targets,
    confidence: clampConfidence(74 + (sequence.hasSpring ? 8 : 0)),
    keyLevels: keyLevels(context, [sequence.sellingClimax.low, sequence.automaticRally.high], []),
    rationale: `${context.ticker} completed an accumulation sequence: selling climax, automatic rally, lower-volume secondary test, and a sign of strength through ${formatPrice(sequence.automaticRally.high)}. Current price is retesting the breakout as last point of support.`,
    timestamp: context.last.time,
  });
}

function detectWyckoffDistribution(context: DetectionContext): PatternDetectionResult | null {
  const sequence = findWyckoffDistributionSequence(context);
  if (!sequence) {
    return null;
  }

  const entry = context.last.close;
  const stopLoss = sequence.secondaryTest.high + context.atr * 0.25;
  const target = sequence.automaticReaction.low - (sequence.buyingClimax.high - sequence.automaticReaction.low) * 1.5;
  const targets = createTargets({
    direction: "SHORT",
    entry,
    stopLoss,
    takeProfit1: sequence.automaticReaction.low,
    takeProfit2: midpoint(sequence.automaticReaction.low, target),
    takeProfit3: target,
  });

  return createDetection({
    pattern: "WYCKOFF_DISTRIBUTION",
    direction: "SHORT",
    entry,
    stopLoss,
    targets,
    confidence: clampConfidence(74 + (sequence.hasUpthrust ? 8 : 0)),
    keyLevels: keyLevels(context, [sequence.buyingClimax.high, sequence.automaticReaction.low], []),
    rationale: `${context.ticker} completed a distribution sequence: buying climax, automatic reaction, lower-volume secondary test, and a sign of weakness below ${formatPrice(sequence.automaticReaction.low)}. Current price is retesting breakdown supply.`,
    timestamp: context.last.time,
  });
}

function detectMomentumEmaCross(context: DetectionContext): PatternDetectionResult | null {
  const previousEma9 = finiteAt(context.indicators.ema9, context.lastIndex - 1);
  const previousEma21 = finiteAt(context.indicators.ema21, context.lastIndex - 1);

  if (!Number.isFinite(previousEma9) || !Number.isFinite(previousEma21)) {
    return null;
  }

  const crossedLong = previousEma9 <= previousEma21 && context.ema9 > context.ema21;
  const crossedShort = previousEma9 >= previousEma21 && context.ema9 < context.ema21;
  const direction: Direction | null = crossedLong ? "LONG" : crossedShort ? "SHORT" : null;

  if (!direction) {
    return null;
  }

  const stackLong = context.ema21 > context.ema50 && context.ema50 > context.ema200;
  const stackShort = context.ema21 < context.ema50 && context.ema50 < context.ema200;
  const rsiConfirms =
    direction === "LONG"
      ? context.rsi > 50 && context.rsi > context.previousRsi
      : context.rsi < 50 && context.rsi < context.previousRsi;
  const macdConfirms =
    direction === "LONG" ? context.macd.histogram > 0 : context.macd.histogram < 0;

  if ((direction === "LONG" && !stackLong) || (direction === "SHORT" && !stackShort) || !rsiConfirms || !macdConfirms) {
    return null;
  }

  const entry = context.last.close;
  const stopLoss =
    direction === "LONG" ? context.ema21 - context.atr * 0.1 : context.ema21 + context.atr * 0.1;
  const targets = createTargets({ direction, entry, stopLoss, rr1: 1.5, rr2: 2.5, rr3: 4 });

  return createDetection({
    pattern: "MOMENTUM_EMA_CROSS",
    direction,
    entry,
    stopLoss,
    targets,
    confidence: clampConfidence(76 + (emaAligned(context, direction) ? 8 : -20)),
    keyLevels: keyLevels(context, [context.ema21, context.ema50, context.ema200], []),
    rationale: `${context.ticker} triggered an EMA9/EMA21 ${direction.toLowerCase()} crossover with the full EMA stack aligned. RSI and MACD histogram both confirm momentum at the entry close.`,
    timestamp: context.last.time,
  });
}

function detectMomentumRsiDivergence(context: DetectionContext): PatternDetectionResult | null {
  const lows = context.indicators.swingLows.length > 0 ? context.indicators.swingLows : findSwingLows(context.candles, 2);
  const highs = context.indicators.swingHighs.length > 0 ? context.indicators.swingHighs : findSwingHighs(context.candles, 2);
  const bullish = findBullishRsiDivergence(context, lows);
  const bearish = findBearishRsiDivergence(context, highs);
  const divergence = bullish ?? bearish;

  if (!divergence) {
    return null;
  }

  const confirmationIndex = divergence.confirmationIndex;
  const entryIndex = Math.min(confirmationIndex + 1, context.lastIndex);
  const entry = context.candles[entryIndex]!.open;
  const stopLoss =
    divergence.direction === "LONG"
      ? divergence.extreme - context.atr * 0.2
      : divergence.extreme + context.atr * 0.2;
  const impulse = Math.abs(divergence.first.price - divergence.second.price);
  const targets = createTargets({
    direction: divergence.direction,
    entry,
    stopLoss,
    takeProfit1: divergence.direction === "LONG" ? entry + impulse : entry - impulse,
    takeProfit2: divergence.direction === "LONG" ? entry + impulse * 1.5 : entry - impulse * 1.5,
    takeProfit3: divergence.direction === "LONG" ? entry + impulse * 2 : entry - impulse * 2,
  });

  return createDetection({
    pattern: "MOMENTUM_RSI_DIV",
    direction: divergence.direction,
    entry,
    stopLoss,
    targets,
    confidence: clampConfidence(70 + (Math.abs(context.macd.histogram) > Math.abs(context.previousMacd.histogram) ? 8 : 0)),
    keyLevels: keyLevels(context, [divergence.first.price, divergence.second.price], []),
    rationale: `${context.ticker} created ${divergence.direction === "LONG" ? "bullish" : "bearish"} RSI divergence between ${formatPrice(divergence.first.price)} and ${formatPrice(divergence.second.price)}. MACD histogram flipped in the signal direction before entry.`,
    timestamp: context.candles[entryIndex]!.time,
  });
}

function detectMomentumMacd(context: DetectionContext): PatternDetectionResult | null {
  const crossedLong =
    context.previousMacd.macd <= context.previousMacd.signal &&
    context.macd.macd > context.macd.signal &&
    context.macd.macd < 0;
  const crossedShort =
    context.previousMacd.macd >= context.previousMacd.signal &&
    context.macd.macd < context.macd.signal &&
    context.macd.macd > 0;
  const direction: Direction | null = crossedLong ? "LONG" : crossedShort ? "SHORT" : null;

  if (!direction) {
    return null;
  }

  const histogramExpanding =
    direction === "LONG"
      ? context.macd.histogram > context.previousMacd.histogram
      : context.macd.histogram < context.previousMacd.histogram;
  const emaSlopeConfirms =
    direction === "LONG" ? context.ema50 > finiteAt(context.indicators.ema50, context.lastIndex - 3) : context.ema50 < finiteAt(context.indicators.ema50, context.lastIndex - 3);

  if (!histogramExpanding || !emaSlopeConfirms) {
    return null;
  }

  const entry = context.last.close;
  const stopLoss = direction === "LONG" ? entry - context.atr * 1.5 : entry + context.atr * 1.5;
  const targets = createTargets({ direction, entry, stopLoss, rr1: 4 / 3, rr2: 8 / 3, rr3: 4 });

  return createDetection({
    pattern: "MOMENTUM_MACD",
    direction,
    entry,
    stopLoss,
    targets,
    confidence: clampConfidence(69 + (emaAligned(context, direction) ? 10 : 0)),
    keyLevels: keyLevels(context, [context.ema50], []),
    rationale: `${context.ticker} printed a MACD ${direction.toLowerCase()} cross ${direction === "LONG" ? "below" : "above"} the zero line with expanding histogram. EMA50 slope confirms the momentum direction.`,
    timestamp: context.last.time,
  });
}

function detectPriceActionBreakerBlock(context: DetectionContext): PatternDetectionResult | null {
  const orderBlocks = context.indicators.orderBlocks.length > 0 ? context.indicators.orderBlocks : findOrderBlocks(context.candles);

  for (const block of orderBlocks.slice().reverse()) {
    const brokeBelow = block.type === "bullish" && context.candles.slice(block.endIndex + 1, context.lastIndex).some((candle) => candle.close < block.low);
    const brokeAbove = block.type === "bearish" && context.candles.slice(block.endIndex + 1, context.lastIndex).some((candle) => candle.close > block.high);

    if (!brokeBelow && !brokeAbove) {
      continue;
    }

    const direction: Direction = brokeBelow ? "SHORT" : "LONG";
    if (!candleTouchesZone(context.last, block.low, block.high)) {
      continue;
    }

    const entry = context.last.close;
    const stopLoss = direction === "LONG" ? block.low - context.atr * 0.25 : block.high + context.atr * 0.25;
    const targets = createTargets({
      direction,
      entry,
      stopLoss,
      takeProfit3: nextStructureTarget(context, direction, entry),
    });

    return createDetection({
      pattern: "PA_BREAKER_BLOCK",
      direction,
      entry,
      stopLoss,
      targets,
      confidence: clampConfidence(68 + (isStrongClose(context.last, direction) ? 8 : 0)),
      keyLevels: keyLevels(context, [block.low, block.high], [], [block]),
      rationale: `${context.ticker} retested a broken ${block.type} order block now acting as a breaker zone between ${formatPrice(block.low)} and ${formatPrice(block.high)}. The retest defines entry with risk beyond the breaker.`,
      timestamp: context.last.time,
    });
  }

  return null;
}

function detectPriceActionSupplyDemand(context: DetectionContext): PatternDetectionResult | null {
  const zones = findSupplyDemandZones(context);

  for (const zone of zones.slice().reverse()) {
    if (zone.touchCount > 2 || !candleTouchesZone(context.last, zone.low, zone.high)) {
      continue;
    }

    const direction: Direction = zone.type === "demand" ? "LONG" : "SHORT";
    const entry = midpoint(zone.low, zone.high);
    const stopLoss = direction === "LONG" ? zone.low - context.atr * 0.15 : zone.high + context.atr * 0.15;
    const targets = createTargets({
      direction,
      entry,
      stopLoss,
      takeProfit3: oppositeZoneTarget(zones, direction, entry) ?? nextStructureTarget(context, direction, entry),
    });
    const confidence = zone.touchCount === 0 ? 90 : zone.touchCount === 1 ? 70 : 40;

    return createDetection({
      pattern: "PA_SUPPLY_DEMAND",
      direction,
      entry,
      stopLoss,
      targets,
      confidence,
      keyLevels: keyLevels(context, [zone.low, zone.high], []),
      rationale: `${context.ticker} returned to a ${zone.touchCount === 0 ? "fresh" : "tested"} ${zone.type} zone between ${formatPrice(zone.low)} and ${formatPrice(zone.high)}. Zone quality is scored from prior touch count and impulse strength.`,
      timestamp: context.last.time,
    });
  }

  return null;
}

function detectPriceActionDoubleTopBottom(context: DetectionContext): PatternDetectionResult | null {
  const highs = context.indicators.swingHighs.length > 0 ? context.indicators.swingHighs : findSwingHighs(context.candles, 2);
  const lows = context.indicators.swingLows.length > 0 ? context.indicators.swingLows : findSwingLows(context.candles, 2);
  const top = findDoubleTop(context, highs, lows);
  const bottom = findDoubleBottom(context, highs, lows);
  const pattern = top ?? bottom;

  if (!pattern) {
    return null;
  }

  const direction = pattern.direction;
  const entry = pattern.neckline;
  const stopLoss =
    direction === "SHORT"
      ? pattern.extreme + context.atr * 0.25
      : pattern.extreme - context.atr * 0.25;
  const measuredMove = Math.abs(pattern.extreme - pattern.neckline);
  const targets = createTargets({
    direction,
    entry,
    stopLoss,
    takeProfit1:
      direction === "SHORT"
        ? pattern.neckline - measuredMove * 0.5
        : pattern.neckline + measuredMove * 0.5,
    takeProfit2:
      direction === "SHORT" ? pattern.neckline - measuredMove : pattern.neckline + measuredMove,
    takeProfit3:
      direction === "SHORT"
        ? pattern.neckline - measuredMove * 1.5
        : pattern.neckline + measuredMove * 1.5,
  });

  return createDetection({
    pattern: "PA_DOUBLE_TOP_BOTTOM",
    direction,
    entry,
    stopLoss,
    targets,
    confidence: clampConfidence(71 + (isVolumeSpike(context, context.lastIndex, 1.2) ? 6 : 0)),
    keyLevels: keyLevels(context, [pattern.extreme, pattern.neckline], []),
    rationale: `${context.ticker} formed a ${direction === "SHORT" ? "double top" : "double bottom"} with both extremes within 0.5% and a neckline at ${formatPrice(pattern.neckline)}. The neckline break/retest activates the measured-move target.`,
    timestamp: context.last.time,
  });
}

function createContext(input: DetectionInput): DetectionContext {
  const lastIndex = input.candles.length - 1;
  const indicators = normalizeIndicators(input.candles, input.indicators);

  return {
    candles: input.candles,
    indicators,
    timeframe: input.timeframe,
    market: input.market,
    ticker: input.ticker,
    lastIndex,
    last: input.candles[lastIndex]!,
    previous: input.candles[Math.max(0, lastIndex - 1)]!,
    atr: finiteAt(indicators.atr14, lastIndex) || averageRange(input.candles.slice(-14)),
    rsi: finiteAt(indicators.rsi14, lastIndex) || 50,
    previousRsi: finiteAt(indicators.rsi14, lastIndex - 1) || 50,
    macd: finiteMacdAt(indicators.macd, lastIndex),
    previousMacd: finiteMacdAt(indicators.macd, lastIndex - 1),
    ema9: finiteAt(indicators.ema9, lastIndex) || input.candles[lastIndex]!.close,
    ema21: finiteAt(indicators.ema21, lastIndex) || input.candles[lastIndex]!.close,
    ema50: finiteAt(indicators.ema50, lastIndex) || input.candles[lastIndex]!.close,
    ema200: finiteAt(indicators.ema200, lastIndex) || input.candles[lastIndex]!.close,
    averageVolume20: averageVolume(input.candles, lastIndex, 20),
  };
}

function normalizeIndicators(candles: Candle[], indicators: ComputedIndicators): ComputedIndicators {
  return {
    ...indicators,
    swingHighs: indicators.swingHighs.length > 0 ? indicators.swingHighs : findSwingHighs(candles, 2),
    swingLows: indicators.swingLows.length > 0 ? indicators.swingLows : findSwingLows(candles, 2),
    orderBlocks: indicators.orderBlocks.length > 0 ? indicators.orderBlocks : findOrderBlocks(candles),
    fairValueGaps:
      indicators.fairValueGaps.length > 0 ? indicators.fairValueGaps : findFairValueGaps(candles),
    marketStructure: indicators.marketStructure ?? detectMarketStructure(candles),
    liquidityLevels:
      indicators.liquidityLevels.length > 0 ? indicators.liquidityLevels : detectLiquidityLevels(candles),
  };
}

function createDetection(params: {
  pattern: PatternType;
  direction: Direction;
  entry: number;
  stopLoss: number;
  targets: { takeProfit1: number; takeProfit2: number; takeProfit3: number };
  confidence: number;
  keyLevels: KeyLevels;
  rationale: string;
  timestamp: number;
}): PatternDetectionResult | null {
  const risk = Math.abs(params.entry - params.stopLoss);
  if (!Number.isFinite(risk) || risk <= 0) {
    return null;
  }

  if (params.direction === "LONG" && params.stopLoss >= params.entry) {
    return null;
  }
  if (params.direction === "SHORT" && params.stopLoss <= params.entry) {
    return null;
  }

  return {
    pattern: params.pattern,
    confidence: clampConfidence(params.confidence),
    direction: params.direction,
    entry: roundPrice(params.entry),
    stopLoss: roundPrice(params.stopLoss),
    takeProfit1: roundPrice(params.targets.takeProfit1),
    takeProfit2: roundPrice(params.targets.takeProfit2),
    takeProfit3: roundPrice(params.targets.takeProfit3),
    riskRewardRatio: roundRatio(Math.abs(params.targets.takeProfit2 - params.entry) / risk),
    keyLevels: params.keyLevels,
    rationale: params.rationale,
    timestamp: params.timestamp,
  };
}

function createTargets(params: {
  direction: Direction;
  entry: number;
  stopLoss: number;
  rr1?: number;
  rr2?: number;
  rr3?: number;
  takeProfit1?: number;
  takeProfit2?: number;
  takeProfit3?: number | null;
}): { takeProfit1: number; takeProfit2: number; takeProfit3: number } {
  const risk = Math.abs(params.entry - params.stopLoss);
  const sign = params.direction === "LONG" ? 1 : -1;
  const takeProfit1 = params.takeProfit1 ?? params.entry + sign * risk * (params.rr1 ?? 1);
  const takeProfit2 = params.takeProfit2 ?? params.entry + sign * risk * (params.rr2 ?? 2);
  const takeProfit3 = params.takeProfit3 ?? params.entry + sign * risk * (params.rr3 ?? 3);

  return { takeProfit1, takeProfit2, takeProfit3 };
}

function findRecentLiquiditySweep(
  context: DetectionContext,
  lookback: number,
): { direction: Direction; index: number; level: number; extreme: number } | null {
  const levels = context.indicators.liquidityLevels;

  for (let index = Math.max(2, context.lastIndex - lookback); index <= context.lastIndex - 2; index += 1) {
    const sweep = sweepAtIndex(context, index, levels);
    if (sweep) {
      return sweep;
    }
  }

  return null;
}

function sweepAtIndex(
  context: DetectionContext,
  index: number,
  levels: LiquidityLevel[],
): { direction: Direction; index: number; level: number; extreme: number } | null {
  const candle = context.candles[index]!;

  for (const level of levels) {
    const isLowLiquidity = ["equal_lows", "swing_low", "session_low"].includes(level.type);
    const isHighLiquidity = ["equal_highs", "swing_high", "session_high"].includes(level.type);
    const minSweep = context.atr * 0.5;

    if (isLowLiquidity && candle.low <= level.price - minSweep && candle.close > level.price) {
      return { direction: "LONG", index, level: level.price, extreme: candle.low };
    }

    if (isHighLiquidity && candle.high >= level.price + minSweep && candle.close < level.price) {
      return { direction: "SHORT", index, level: level.price, extreme: candle.high };
    }
  }

  return null;
}

function findImmediateFvg(
  context: DetectionContext,
  sweepIndex: number,
  direction: Direction,
): FairValueGap | null {
  const desiredType = direction === "LONG" ? "bullish" : "bearish";
  const gaps = context.indicators.fairValueGaps;
  return (
    gaps.find((gap) => gap.type === desiredType && gap.index >= sweepIndex && gap.index <= sweepIndex + 3) ??
    null
  );
}

function findRecentTurtleSoupReversal(
  context: DetectionContext,
  highs: SwingPoint[],
  lows: SwingPoint[],
): { direction: Direction; entry: number; level: number; extreme: number } | null {
  for (const high of highs.slice().reverse()) {
    if (context.lastIndex - high.index < 5) {
      continue;
    }
    const breachIndex = context.candles.findIndex(
      (candle, index) => index > high.index && index >= context.lastIndex - 6 && candle.high > high.price,
    );
    if (breachIndex < 0) {
      continue;
    }
    const reversalIndex = range(breachIndex + 2, Math.min(breachIndex + 5, context.lastIndex)).find(
      (index) => context.candles[index]!.close < high.price,
    );
    if (reversalIndex !== undefined && context.lastIndex - reversalIndex <= 2) {
      return {
        direction: "SHORT",
        entry: context.candles[reversalIndex]!.close,
        level: high.price,
        extreme: maxHigh(context.candles.slice(breachIndex, reversalIndex + 1)),
      };
    }
  }

  for (const low of lows.slice().reverse()) {
    if (context.lastIndex - low.index < 5) {
      continue;
    }
    const breachIndex = context.candles.findIndex(
      (candle, index) => index > low.index && index >= context.lastIndex - 6 && candle.low < low.price,
    );
    if (breachIndex < 0) {
      continue;
    }
    const reversalIndex = range(breachIndex + 2, Math.min(breachIndex + 5, context.lastIndex)).find(
      (index) => context.candles[index]!.close > low.price,
    );
    if (reversalIndex !== undefined && context.lastIndex - reversalIndex <= 2) {
      return {
        direction: "LONG",
        entry: context.candles[reversalIndex]!.close,
        level: low.price,
        extreme: minLow(context.candles.slice(breachIndex, reversalIndex + 1)),
      };
    }
  }

  return null;
}

function lastRecentEvent(
  events: { direction: Direction; index: number; level: number }[],
  lastIndex: number,
  lookback: number,
): { direction: Direction; index: number; level: number } | null {
  return events
    .slice()
    .reverse()
    .find((event) => lastIndex - event.index <= lookback) ?? null;
}

function findNearestConfluenceEntry(
  context: DetectionContext,
  direction: Direction,
  fallbackLevel: number,
): number | null {
  const block = context.indicators.orderBlocks
    .slice()
    .reverse()
    .find((candidate) => candidate.type === (direction === "LONG" ? "bullish" : "bearish"));

  if (block && Math.abs(midpoint(block.low, block.high) - fallbackLevel) / fallbackLevel < 0.03) {
    return midpoint(block.low, block.high);
  }

  const gap = context.indicators.fairValueGaps
    .slice()
    .reverse()
    .find((candidate) => candidate.type === (direction === "LONG" ? "bullish" : "bearish"));

  if (gap && Math.abs(gap.midpoint - fallbackLevel) / fallbackLevel < 0.03) {
    return gap.midpoint;
  }

  return null;
}

function hasRsiDivergence(context: DetectionContext, direction: Direction): boolean {
  const divergence =
    direction === "LONG"
      ? findBullishRsiDivergence(context, context.indicators.swingLows)
      : findBearishRsiDivergence(context, context.indicators.swingHighs);

  return divergence !== null;
}

function findBullishRsiDivergence(
  context: DetectionContext,
  lows: SwingPoint[],
): {
  direction: "LONG";
  first: SwingPoint;
  second: SwingPoint;
  extreme: number;
  confirmationIndex: number;
} | null {
  const recent = lows.filter((low) => context.lastIndex - low.index <= 20).slice(-3);
  if (recent.length < 2) {
    return null;
  }

  const first = recent[recent.length - 2]!;
  const second = recent[recent.length - 1]!;
  const firstRsi = finiteAt(context.indicators.rsi14, first.index);
  const secondRsi = finiteAt(context.indicators.rsi14, second.index);
  const macdFlip = context.previousMacd.histogram <= 0 && context.macd.histogram > 0;

  if (second.price < first.price && secondRsi > firstRsi && macdFlip) {
    return {
      direction: "LONG",
      first,
      second,
      extreme: second.price,
      confirmationIndex: context.lastIndex - 1,
    };
  }

  return null;
}

function findBearishRsiDivergence(
  context: DetectionContext,
  highs: SwingPoint[],
): {
  direction: "SHORT";
  first: SwingPoint;
  second: SwingPoint;
  extreme: number;
  confirmationIndex: number;
} | null {
  const recent = highs.filter((high) => context.lastIndex - high.index <= 20).slice(-3);
  if (recent.length < 2) {
    return null;
  }

  const first = recent[recent.length - 2]!;
  const second = recent[recent.length - 1]!;
  const firstRsi = finiteAt(context.indicators.rsi14, first.index);
  const secondRsi = finiteAt(context.indicators.rsi14, second.index);
  const macdFlip = context.previousMacd.histogram >= 0 && context.macd.histogram < 0;

  if (second.price > first.price && secondRsi < firstRsi && macdFlip) {
    return {
      direction: "SHORT",
      first,
      second,
      extreme: second.price,
      confirmationIndex: context.lastIndex - 1,
    };
  }

  return null;
}

function identifyTradingRange(candles: Candle[], endIndex: number, minCandles: number): TradingRange | null {
  if (endIndex + 1 < minCandles) {
    return null;
  }

  const startIndex = endIndex - minCandles + 1;
  const window = candles.slice(startIndex, endIndex + 1);
  const high = maxHigh(window);
  const low = minLow(window);
  const mid = midpoint(low, high);
  const height = high - low;
  const averageBody = average(window.map((candle) => Math.abs(candle.close - candle.open)));
  const oscillationCount = window.filter((candle) => candle.high > mid && candle.low < mid).length;
  const bounded = height / mid <= 0.12 || oscillationCount >= Math.floor(minCandles / 3);

  if (!bounded || averageBody > height * 0.45) {
    return null;
  }

  return { startIndex, endIndex, low, high, mid, height };
}

function findWyckoffAccumulationSequence(context: DetectionContext):
  | {
      sellingClimax: Candle;
      automaticRally: Candle;
      secondaryTest: Candle;
      hasSpring: boolean;
    }
  | null {
  const window = context.candles.slice(Math.max(0, context.lastIndex - 60));
  const recentHigh = maxHigh(window.slice(0, Math.max(10, Math.floor(window.length / 2))));
  const recentLow = minLow(window);
  if ((recentHigh - recentLow) / recentHigh < 0.1) {
    return null;
  }

  const avgVol = average(window.map((candle) => candle.volume));
  const scIndex = window.findIndex(
    (candle) => isBearish(candle) && candle.volume > avgVol * 2 && candleRange(candle) > averageRange(window) * 1.5,
  );
  if (scIndex < 0) {
    return null;
  }

  const sellingClimax = window[scIndex]!;
  const automaticRally = highestCandle(window.slice(scIndex + 1, scIndex + 6));
  const stCandidates = window.slice(scIndex + 3, scIndex + 25).filter(
    (candle) =>
      Math.abs(candle.low - sellingClimax.low) / sellingClimax.low < 0.03 &&
      candle.volume < sellingClimax.volume,
  );
  const secondaryTest = stCandidates.at(-1);
  if (!secondaryTest || !automaticRally) {
    return null;
  }

  const sos = window
    .slice(window.indexOf(secondaryTest) + 1)
    .find((candle) => candle.close > automaticRally.high && candle.volume > avgVol * 1.4);
  const lps =
    sos &&
    Math.abs(context.last.low - automaticRally.high) / automaticRally.high < 0.025 &&
    context.last.close >= automaticRally.high * 0.995;

  if (!sos || !lps) {
    return null;
  }

  const hasSpring = window.some(
    (candle) => candle.low < sellingClimax.low && candle.close > sellingClimax.low && candle.volume < avgVol,
  );

  return { sellingClimax, automaticRally, secondaryTest, hasSpring };
}

function findWyckoffDistributionSequence(context: DetectionContext):
  | {
      buyingClimax: Candle;
      automaticReaction: Candle;
      secondaryTest: Candle;
      hasUpthrust: boolean;
    }
  | null {
  const window = context.candles.slice(Math.max(0, context.lastIndex - 60));
  const recentLow = minLow(window.slice(0, Math.max(10, Math.floor(window.length / 2))));
  const recentHigh = maxHigh(window);
  if ((recentHigh - recentLow) / recentLow < 0.1) {
    return null;
  }

  const avgVol = average(window.map((candle) => candle.volume));
  const bcIndex = window.findIndex(
    (candle) => isBullish(candle) && candle.volume > avgVol * 2 && candleRange(candle) > averageRange(window) * 1.5,
  );
  if (bcIndex < 0) {
    return null;
  }

  const buyingClimax = window[bcIndex]!;
  const automaticReaction = lowestCandle(window.slice(bcIndex + 1, bcIndex + 6));
  const stCandidates = window.slice(bcIndex + 3, bcIndex + 25).filter(
    (candle) =>
      Math.abs(candle.high - buyingClimax.high) / buyingClimax.high < 0.03 &&
      candle.volume < buyingClimax.volume,
  );
  const secondaryTest = stCandidates.at(-1);
  if (!secondaryTest || !automaticReaction) {
    return null;
  }

  const sow = window
    .slice(window.indexOf(secondaryTest) + 1)
    .find((candle) => candle.close < automaticReaction.low && candle.volume > avgVol * 1.4);
  const lpsy =
    sow &&
    Math.abs(context.last.high - automaticReaction.low) / automaticReaction.low < 0.025 &&
    context.last.close <= automaticReaction.low * 1.005;

  if (!sow || !lpsy) {
    return null;
  }

  const hasUpthrust = window.some(
    (candle) => candle.high > buyingClimax.high && candle.close < buyingClimax.high && candle.volume > avgVol,
  );

  return { buyingClimax, automaticReaction, secondaryTest, hasUpthrust };
}

function findSupplyDemandZones(context: DetectionContext): Zone[] {
  const zones: Zone[] = [];

  for (let index = 1; index < context.lastIndex - 1; index += 1) {
    const impulse = context.candles[index + 1]!.close - context.candles[index]!.close;
    const strongImpulse = Math.abs(impulse) >= context.atr * 1.5;
    if (!strongImpulse) {
      continue;
    }

    const origin = context.candles[index]!;
    if (impulse > 0 && isBearish(origin)) {
      zones.push({
        type: "demand",
        low: Math.min(origin.open, origin.close),
        high: Math.max(origin.open, origin.close),
        startIndex: index,
        touchCount: countTouches(context.candles, index + 2, context.lastIndex - 1, origin),
      });
    }

    if (impulse < 0 && isBullish(origin)) {
      zones.push({
        type: "supply",
        low: Math.min(origin.open, origin.close),
        high: Math.max(origin.open, origin.close),
        startIndex: index,
        touchCount: countTouches(context.candles, index + 2, context.lastIndex - 1, origin),
      });
    }
  }

  return zones;
}

function countTouches(candles: Candle[], start: number, end: number, zoneCandle: Candle): number {
  const low = Math.min(zoneCandle.open, zoneCandle.close);
  const high = Math.max(zoneCandle.open, zoneCandle.close);
  return range(start, end).filter((index) => candleTouchesZone(candles[index]!, low, high)).length;
}

function findDoubleTop(
  context: DetectionContext,
  highs: SwingPoint[],
  lows: SwingPoint[],
): { direction: "SHORT"; neckline: number; extreme: number } | null {
  for (let rightIndex = highs.length - 1; rightIndex >= 1; rightIndex -= 1) {
    const right = highs[rightIndex]!;
    const left = highs
      .slice(0, rightIndex)
      .reverse()
      .find((candidate) => right.index - candidate.index >= 5 && Math.abs(right.price - candidate.price) / candidate.price <= 0.005);
    if (!left) {
      continue;
    }

    const necklineSwing = lows
      .filter((low) => low.index > left.index && low.index < right.index)
      .sort((a, b) => a.price - b.price)[0];
    if (!necklineSwing) {
      continue;
    }

    const brokeOrRetested = context.last.close < necklineSwing.price || candleTouchesLevel(context.last, necklineSwing.price);
    if (brokeOrRetested) {
      return {
        direction: "SHORT",
        neckline: necklineSwing.price,
        extreme: Math.max(left.price, right.price),
      };
    }
  }

  return null;
}

function findDoubleBottom(
  context: DetectionContext,
  highs: SwingPoint[],
  lows: SwingPoint[],
): { direction: "LONG"; neckline: number; extreme: number } | null {
  for (let rightIndex = lows.length - 1; rightIndex >= 1; rightIndex -= 1) {
    const right = lows[rightIndex]!;
    const left = lows
      .slice(0, rightIndex)
      .reverse()
      .find((candidate) => right.index - candidate.index >= 5 && Math.abs(right.price - candidate.price) / candidate.price <= 0.005);
    if (!left) {
      continue;
    }

    const necklineSwing = highs
      .filter((high) => high.index > left.index && high.index < right.index)
      .sort((a, b) => b.price - a.price)[0];
    if (!necklineSwing) {
      continue;
    }

    const brokeOrRetested = context.last.close > necklineSwing.price || candleTouchesLevel(context.last, necklineSwing.price);
    if (brokeOrRetested) {
      return {
        direction: "LONG",
        neckline: necklineSwing.price,
        extreme: Math.min(left.price, right.price),
      };
    }
  }

  return null;
}

function keyLevels(
  context: DetectionContext,
  levels: number[],
  gaps: FairValueGap[],
  blocks: OrderBlock[] = [],
): KeyLevels {
  const supports = context.indicators.swingLows
    .map((swing) => swing.price)
    .concat(levels.filter((level) => level < context.last.close))
    .slice(-6);
  const resistances = context.indicators.swingHighs
    .map((swing) => swing.price)
    .concat(levels.filter((level) => level >= context.last.close))
    .slice(-6);

  return {
    support: supports.map(roundPrice),
    resistance: resistances.map(roundPrice),
    orderBlocks: blocks.map((block) => ({
      price: roundPrice(midpoint(block.low, block.high)),
      type: block.type,
      low: roundPrice(block.low),
      high: roundPrice(block.high),
    })),
    fvg: gaps.map((gap) => ({
      low: roundPrice(gap.low),
      high: roundPrice(gap.high),
      type: gap.type,
    })),
    liquidityLevels: context.indicators.liquidityLevels.slice(-8).map((level) => roundPrice(level.price)),
  };
}

function nextStructureTarget(context: DetectionContext, direction: Direction, entry: number): number {
  const candidates =
    direction === "LONG"
      ? context.indicators.swingHighs.map((swing) => swing.price).filter((price) => price > entry)
      : context.indicators.swingLows.map((swing) => swing.price).filter((price) => price < entry);

  if (candidates.length === 0) {
    return direction === "LONG" ? entry + context.atr * 3 : entry - context.atr * 3;
  }

  return direction === "LONG" ? Math.min(...candidates) : Math.max(...candidates);
}

function nextOpposingLiquidity(context: DetectionContext, direction: Direction, entry: number): number | null {
  const candidates =
    direction === "LONG"
      ? context.indicators.liquidityLevels.map((level) => level.price).filter((price) => price > entry)
      : context.indicators.liquidityLevels.map((level) => level.price).filter((price) => price < entry);

  if (candidates.length === 0) {
    return null;
  }

  return direction === "LONG" ? Math.min(...candidates) : Math.max(...candidates);
}

function protectiveSwingLevel(context: DetectionContext, direction: Direction): number {
  if (direction === "LONG") {
    return context.indicators.swingLows.at(-1)?.price ?? minLow(context.candles.slice(-10));
  }

  return context.indicators.swingHighs.at(-1)?.price ?? maxHigh(context.candles.slice(-10));
}

function oppositeZoneTarget(zones: Zone[], direction: Direction, entry: number): number | null {
  const candidates = zones
    .filter((zone) => zone.type === (direction === "LONG" ? "supply" : "demand"))
    .map((zone) => midpoint(zone.low, zone.high))
    .filter((price) => (direction === "LONG" ? price > entry : price < entry));

  if (candidates.length === 0) {
    return null;
  }

  return direction === "LONG" ? Math.min(...candidates) : Math.max(...candidates);
}

function isKillZone(time: number): boolean {
  const minutes = easternMinutes(time);
  return (
    between(minutes, 2 * 60, 5 * 60) ||
    between(minutes, 9 * 60 + 30, 11 * 60) ||
    between(minutes, 10 * 60, 12 * 60)
  );
}

function easternMinutes(time: number): number {
  const milliseconds = time > 10_000_000_000 ? time : time * 1000;
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "America/New_York",
  }).formatToParts(new Date(milliseconds));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);

  return (hour % 24) * 60 + minute;
}

function isReversalConfirmation(sweep: Candle, confirmation: Candle, direction: Direction): boolean {
  if (direction === "LONG") {
    return isBullish(confirmation) && (confirmation.close > sweep.open || isBullishEngulfing(sweep, confirmation));
  }

  return isBearish(confirmation) && (confirmation.close < sweep.open || isBearishEngulfing(sweep, confirmation));
}

function isStrongClose(candle: Candle, direction: Direction): boolean {
  const rangeValue = candleRange(candle);
  if (rangeValue === 0) {
    return false;
  }

  return direction === "LONG"
    ? (candle.close - candle.low) / rangeValue >= 0.7
    : (candle.high - candle.close) / rangeValue >= 0.7;
}

function isBullishEngulfing(previous: Candle, current: Candle): boolean {
  return isBearish(previous) && isBullish(current) && current.open <= previous.close && current.close >= previous.open;
}

function isBearishEngulfing(previous: Candle, current: Candle): boolean {
  return isBullish(previous) && isBearish(current) && current.open >= previous.close && current.close <= previous.open;
}

function emaAligned(context: DetectionContext, direction: Direction): boolean {
  if (direction === "LONG") {
    return context.ema9 > context.ema21 && context.ema21 >= context.ema50;
  }

  return context.ema9 < context.ema21 && context.ema21 <= context.ema50;
}

function isVolumeSpike(context: DetectionContext, index: number, multiple: number): boolean {
  return context.candles[index]!.volume >= averageVolume(context.candles, index - 1, 20) * multiple;
}

function averageVolume(candles: Candle[], endIndex: number, period: number): number {
  const end = Math.max(0, endIndex);
  const start = Math.max(0, end - period + 1);
  return average(candles.slice(start, end + 1).map((candle) => candle.volume));
}

function finiteAt(series: number[], index: number): number {
  if (index < 0) {
    return Number.NaN;
  }

  const value = series[index];
  if (value !== undefined && Number.isFinite(value)) {
    return value;
  }

  return Number.NaN;
}

function finiteMacdAt(
  series: { macd: number; signal: number; histogram: number }[],
  index: number,
): { macd: number; signal: number; histogram: number } {
  if (index < 0) {
    return { macd: Number.NaN, signal: Number.NaN, histogram: Number.NaN };
  }

  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const value = series[cursor];
    if (value && Number.isFinite(value.macd) && Number.isFinite(value.signal) && Number.isFinite(value.histogram)) {
      return value;
    }
  }

  return { macd: Number.NaN, signal: Number.NaN, histogram: Number.NaN };
}

function zoneOverlap(first: { low: number; high: number }, second: { low: number; high: number }): boolean {
  return Math.max(first.low, second.low) <= Math.min(first.high, second.high);
}

function overlapZone(first: { low: number; high: number }, second: { low: number; high: number }): { low: number; high: number } {
  return {
    low: Math.max(first.low, second.low),
    high: Math.min(first.high, second.high),
  };
}

function candleTouchesZone(candle: Candle, low: number, high: number): boolean {
  return candle.low <= high && candle.high >= low;
}

function candleTouchesLevel(candle: Candle, level: number): boolean {
  return candle.low <= level && candle.high >= level;
}

function highestCandle(candles: Candle[]): Candle | null {
  if (candles.length === 0) {
    return null;
  }

  return candles.reduce((best, candle) => (candle.high > best.high ? candle : best), candles[0]!);
}

function lowestCandle(candles: Candle[]): Candle | null {
  if (candles.length === 0) {
    return null;
  }

  return candles.reduce((best, candle) => (candle.low < best.low ? candle : best), candles[0]!);
}

function maxHigh(candles: Candle[]): number {
  return Math.max(...candles.map((candle) => candle.high));
}

function minLow(candles: Candle[]): number {
  return Math.min(...candles.map((candle) => candle.low));
}

function averageRange(candles: Candle[]): number {
  return average(candles.map(candleRange));
}

function candleRange(candle: Candle): number {
  return candle.high - candle.low;
}

function isBullish(candle: Candle): boolean {
  return candle.close > candle.open;
}

function isBearish(candle: Candle): boolean {
  return candle.close < candle.open;
}

function midpoint(low: number, high: number): number {
  return (low + high) / 2;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function between(value: number, startInclusive: number, endInclusive: number): boolean {
  return value >= startInclusive && value <= endInclusive;
}

function range(start: number, endInclusive: number): number[] {
  if (endInclusive < start) {
    return [];
  }

  return Array.from({ length: endInclusive - start + 1 }, (_value, offset) => start + offset);
}

function clampConfidence(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
}

function roundPrice(value: number): number {
  return Math.round(value * 100_000) / 100_000;
}

function roundRatio(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatPrice(value: number): string {
  return roundPrice(value).toString();
}
