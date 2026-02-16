"use client";

import { useMemo } from "react";
import { usePythStream, PricePoint } from "@/lib/hooks";

const VIEW_W = 400;
const VIEW_H = 160;
const PAD_LEFT = 52;
const PAD_RIGHT = 8;
const PAD_TOP = 8;
const PAD_BOTTOM = 8;
const CHART_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const CHART_H = VIEW_H - PAD_TOP - PAD_BOTTOM;
const GRID_LINES = 3;

function generateChartData(points: PricePoint[]) {
  if (points.length < 2) return null;

  const prices = points.map((p) => p.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 0.01;
  const padding = range * 0.1;
  const yMin = minP - padding;
  const yMax = maxP + padding;
  const yRange = yMax - yMin;

  const toX = (i: number) =>
    PAD_LEFT + (i / (points.length - 1)) * CHART_W;
  const toY = (price: number) =>
    PAD_TOP + (1 - (price - yMin) / yRange) * CHART_H;

  // Line path
  const lineParts = points.map(
    (p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.price).toFixed(1)}`
  );
  const linePath = lineParts.join("");

  // Area path (line + close to bottom)
  const lastX = toX(points.length - 1);
  const firstX = toX(0);
  const bottomY = PAD_TOP + CHART_H;
  const areaPath = `${linePath}L${lastX.toFixed(1)},${bottomY}L${firstX.toFixed(1)},${bottomY}Z`;

  // Current point
  const last = points[points.length - 1];
  const cx = toX(points.length - 1);
  const cy = toY(last.price);

  // Trend: green if last >= first visible
  const isUp = last.price >= points[0].price;

  // Grid lines
  const gridLines: { y: number; label: string }[] = [];
  for (let i = 0; i < GRID_LINES; i++) {
    const frac = (i + 1) / (GRID_LINES + 1);
    const price = yMax - frac * yRange;
    gridLines.push({
      y: PAD_TOP + frac * CHART_H,
      label: price.toFixed(2),
    });
  }

  return { linePath, areaPath, cx, cy, isUp, gridLines };
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "connected"
      ? "bg-green-400"
      : status === "connecting"
        ? "bg-amber-400"
        : "bg-gray-500";
  const ping =
    status === "connected"
      ? "bg-green-400"
      : status === "connecting"
        ? "bg-amber-400"
        : "";

  return (
    <span className="relative flex h-2 w-2">
      {ping && (
        <span
          className={`absolute inset-0 rounded-full ${ping} animate-ping opacity-75`}
        />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  );
}

export default function PriceChart() {
  const { points, currentPrice, status } = usePythStream();

  const chart = useMemo(() => generateChartData(points), [points]);

  const strokeColor = chart?.isUp ? "#22c55e" : "#ef4444";
  const fillId = chart?.isUp ? "areaGradientUp" : "areaGradientDown";
  const gradientColor = chart?.isUp ? "#22c55e" : "#ef4444";

  return (
    <div className="glass gradient-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            Live
          </span>
          <span className="text-xs text-gray-500 ml-1">SOL/USD</span>
        </div>
        <span className="text-sm font-mono font-bold text-white tabular-nums">
          {currentPrice !== null ? `$${currentPrice.toFixed(2)}` : "---"}
        </span>
      </div>

      {/* Chart area */}
      <div className="px-2 pb-2">
        {!chart ? (
          <div className="flex items-center justify-center gap-2 py-10 text-gray-500 text-xs">
            <span className="css-spinner" />
            Loading price data...
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="w-full"
            style={{ aspectRatio: "5/2" }}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="areaGradientUp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#22c55e" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient
                id="areaGradientDown"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#ef4444" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            {chart.gridLines.map((g, i) => (
              <g key={i}>
                <line
                  x1={PAD_LEFT}
                  y1={g.y}
                  x2={VIEW_W - PAD_RIGHT}
                  y2={g.y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="4 4"
                />
                <text
                  x={PAD_LEFT - 6}
                  y={g.y + 3}
                  textAnchor="end"
                  fill="rgba(255,255,255,0.3)"
                  fontSize="8"
                  fontFamily="monospace"
                >
                  {g.label}
                </text>
              </g>
            ))}

            {/* Area fill */}
            <path d={chart.areaPath} fill={`url(#${fillId})`} />

            {/* Price line */}
            <path
              d={chart.linePath}
              fill="none"
              stroke={strokeColor}
              strokeWidth="1.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />

            {/* Current price dot + ping */}
            <circle
              cx={chart.cx}
              cy={chart.cy}
              r="4"
              fill={strokeColor}
              opacity="0.3"
              className="chart-ping"
            />
            <circle
              cx={chart.cx}
              cy={chart.cy}
              r="2.5"
              fill={strokeColor}
              stroke="#0a0a1a"
              strokeWidth="1"
            />
          </svg>
        )}
      </div>
    </div>
  );
}
