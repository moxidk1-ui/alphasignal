"use client";

import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import type { Candle, Signal } from "@/lib/platform-types";
import { cn } from "@/lib/classes";

interface Zone {
  label: string;
  high: number;
  low: number;
  color: string;
}

interface ProjectedZone extends Zone {
  top: number;
  height: number;
}

type ChartSignal = Pick<
  Signal,
  "entryPrice" | "stopLoss" | "takeProfit1" | "takeProfit2" | "takeProfit3" | "direction" | "strategy" | "keyLevels"
>;

export function TradingChart({
  candles,
  signal,
  compact = false,
}: {
  candles: Candle[];
  signal?: ChartSignal | undefined;
  compact?: boolean | undefined;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi>();
  const seriesRef = useRef<ISeriesApi<"Candlestick">>();
  const [zones, setZones] = useState<ProjectedZone[]>([]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;

    const chart = createChart(element, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#111318" },
        textColor: "#64748b",
        fontFamily: "JetBrains Mono",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1a1d27" },
        horzLines: { color: "#1a1d27" },
      },
      rightPriceScale: { borderColor: "#252a3a" },
      timeScale: { borderColor: "#252a3a", timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
    });
    const series = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      borderVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = undefined;
      seriesRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || candles.length === 0) return;

    series.setData(
      candles.map((candle) => ({
        time: candle.time as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    );
    chart.timeScale().fitContent();

    const lines = signal
      ? [
          { price: signal.entryPrice, title: "ENTRY", color: "#3b82f6", lineStyle: LineStyle.Dashed },
          { price: signal.stopLoss, title: "SL", color: "#ef4444", lineStyle: LineStyle.Dashed },
          { price: signal.takeProfit1, title: "TP1", color: "#22c55e", lineStyle: LineStyle.Dashed },
          { price: signal.takeProfit2, title: "TP2", color: "#22c55e", lineStyle: LineStyle.Dotted },
          { price: signal.takeProfit3, title: "TP3", color: "#22c55e", lineStyle: LineStyle.Dotted },
        ]
      : [];
    const created = lines.map((line) =>
      series.createPriceLine({ ...line, lineWidth: 1, axisLabelVisible: true }),
    );
    if (signal) {
      series.setMarkers([
        {
          time: candles[candles.length - 1]!.time as UTCTimestamp,
          position: signal.direction === "LONG" ? "belowBar" : "aboveBar",
          color: signal.direction === "LONG" ? "#22c55e" : "#ef4444",
          shape: signal.direction === "LONG" ? "arrowUp" : "arrowDown",
          text: signal.strategy.replaceAll("_", " "),
        },
      ]);
    } else {
      series.setMarkers([]);
    }

    const project = () => {
      const mapped = signalZones(signal).reduce<ProjectedZone[]>((output, zone) => {
          const top = series.priceToCoordinate(zone.high);
          const bottom = series.priceToCoordinate(zone.low);
          if (top !== null && bottom !== null) {
            output.push({ ...zone, top: Number(top), height: Math.max(Number(bottom) - Number(top), 3) });
          }
          return output;
        }, []);
      setZones(mapped);
    };
    const frame = requestAnimationFrame(project);
    chart.timeScale().subscribeVisibleTimeRangeChange(project);

    return () => {
      cancelAnimationFrame(frame);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(project);
      for (const line of created) series.removePriceLine(line);
    };
  }, [candles, signal]);

  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-background-surface", compact ? "min-h-[128px]" : "min-h-[440px]")}>
      <div ref={host} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-y-0 right-14 w-[34%]">
        {zones.map((zone) => (
          <div
            key={`${zone.label}-${zone.low}`}
            className="absolute left-0 right-0 border-y text-[10px]"
            style={{ top: zone.top, height: zone.height, color: zone.color, borderColor: zone.color, backgroundColor: `${zone.color}20` }}
          >
            <span className="absolute left-2 top-0 bg-background-surface px-1">{zone.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function signalZones(signal?: ChartSignal): Zone[] {
  if (!signal || !signal.keyLevels || typeof signal.keyLevels !== "object") return [];
  const values = signal.keyLevels as {
    fvg?: { low?: unknown; high?: unknown }[];
    orderBlocks?: { low?: unknown; high?: unknown; price?: unknown; type?: unknown }[];
  };
  const gaps = Array.isArray(values.fvg)
    ? values.fvg
        .filter((gap): gap is { low: number; high: number } => typeof gap.low === "number" && typeof gap.high === "number")
        .map((gap) => ({ label: "FVG", low: gap.low, high: gap.high, color: "#3b82f6" }))
    : [];
  const blocks = Array.isArray(values.orderBlocks)
    ? values.orderBlocks.flatMap((block) => {
        const center = typeof block.price === "number" ? block.price : undefined;
        const low = typeof block.low === "number" ? block.low : center ? center * 0.999 : undefined;
        const high = typeof block.high === "number" ? block.high : center ? center * 1.001 : undefined;
        return low && high
          ? [{ label: "OB", low, high, color: block.type === "bearish" ? "#ef4444" : "#22c55e" }]
          : [];
      })
    : [];
  return [...gaps, ...blocks].slice(0, 5);
}
