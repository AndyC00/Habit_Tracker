import { useEffect, useState } from "react";
import * as store from "./localStore";

type Point = { date: string; minutes: number };

// ------------------ Week Chart (SVG) ------------------
export function WeekChart({ habitId }: { habitId: number }) {
  const [points, setPoints] = useState<Point[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        const series = await store.getRecentSeries(habitId, 7);
        // cumulative values (non-decreasing)
        let acc = 0;
        const cumulative = series.map((p) => {
          acc += p.minutes;
          return { date: p.date, minutes: acc };
        });
        setPoints(cumulative);
      } catch (e: any) {
        setErr(e.message ?? "Failed to load week series");
      }
    })();
  }, [habitId]);

  if (err) return <div className="error">{err}</div>;
  if (!points) return <div className="loading">Loading…</div>;

  // Y-axis 0..max cumulative value
  const values = points.map((p) => p.minutes);
  const vmax = Math.max(...values);
  const yMin = 0;
  const yMax = Math.max(1, vmax); // avoid zero range
  const ticks = 5;

  const width = 540; // chart area including margins
  const height = 220;
  const margin = { top: 20, right: 24, bottom: 28, left: 40 };
  const iw = width - margin.left - margin.right;
  const ih = height - margin.top - margin.bottom;

  const xScale = (i: number) => (i / (points.length - 1)) * iw;
  const yScale = (v: number) => {
    if (yMax === yMin) return ih / 2;
    const t = (v - yMin) / (yMax - yMin);
    return ih - t * ih;
  };

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xScale(i)},${yScale(p.minutes)}`)
    .join(" ");

  const gridYs = Array.from({ length: ticks }, (_, i) => i);
  const yAtTick = (i: number) => {
    const t = i / (ticks - 1);
    return yMin + (yMax - yMin) * (1 - t);
  };

  const fmtDay = (iso: string) => iso.slice(5); // MM-DD

  return (
    <div className="chart">
      <svg width={width} height={height} role="img" aria-label="7-day line chart">
        <g transform={`translate(${margin.left},${margin.top})`}>
          {gridYs.map((gi) => {
            const v = yAtTick(gi);
            const y = yScale(v);
            return (
              <g key={gi}>
                <line x1={0} y1={y} x2={iw} y2={y} stroke="#333" strokeDasharray="4,4" />
                <text
                  x={-8}
                  y={y}
                  dominantBaseline="middle"
                  textAnchor="end"
                  fontSize={12}
                  fill="#bbb"
                >
                  {Math.round(v)}
                </text>
              </g>
            );
          })}

          {/* x-axis labels */}
          {points.map((p, i) => (
            <text
              key={p.date}
              x={xScale(i)}
              y={ih + 16}
              textAnchor="middle"
              fontSize={11}
              fill="#bbb"
            >
              {fmtDay(p.date)}
            </text>
          ))}

          {/* line path */}
          <path d={pathD} fill="none" stroke="#ffffff" strokeWidth={2} />

          {/* points */}
          {points.map((p, i) => (
            <circle key={p.date} cx={xScale(i)} cy={yScale(p.minutes)} r={3} fill="#ffffff" />
          ))}
        </g>
      </svg>
    </div>
  );
}

// ------------------ Month Chart (SVG) ------------------
export function MonthChart({ habitId }: { habitId: number }) {
  const [points, setPoints] = useState<Point[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        const series = await store.getMonthSeries(habitId);
        let acc = 0;
        const cumulative = series.map((p) => {
          acc += p.minutes;
          return { date: p.date, minutes: acc };
        });
        setPoints(cumulative);
      } catch (e: any) {
        setErr(e.message ?? "Failed to load month series");
      }
    })();
  }, [habitId]);

  if (err) return <div className="error">{err}</div>;
  if (!points) return <div className="loading">Loading…</div>;

  const values = points.map((p) => p.minutes);
  const vmax = Math.max(...values);
  const yMin = 0;
  const yMax = Math.max(1, vmax);
  const ticks = 5;

  const width = 540;
  const height = 220;
  const margin = { top: 20, right: 24, bottom: 28, left: 40 };
  const iw = width - margin.left - margin.right;
  const ih = height - margin.top - margin.bottom;

  const xScale = (i: number) => (i / (points.length - 1)) * iw;
  const yScale = (v: number) => {
    if (yMax === yMin) return ih / 2;
    const t = (v - yMin) / (yMax - yMin);
    return ih - t * ih;
  };

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xScale(i)},${yScale(p.minutes)}`)
    .join(" ");

  const gridYs = Array.from({ length: ticks }, (_, i) => i);
  const yAtTick = (i: number) => {
    const t = i / (ticks - 1);
    return yMin + (yMax - yMin) * (1 - t);
  };

  const labelStride = Math.max(1, Math.ceil(points.length / 10));
  const fmtDay = (iso: string) => iso.slice(8); // DD

  return (
    <div className="chart">
      <svg width={width} height={height} role="img" aria-label="month line chart">
        <g transform={`translate(${margin.left},${margin.top})`}>
          {gridYs.map((gi) => {
            const v = yAtTick(gi);
            const y = yScale(v);
            return (
              <g key={gi}>
                <line x1={0} y1={y} x2={iw} y2={y} stroke="#333" strokeDasharray="4,4" />
                <text
                  x={-8}
                  y={y}
                  dominantBaseline="middle"
                  textAnchor="end"
                  fontSize={12}
                  fill="#bbb"
                >
                  {Math.round(v)}
                </text>
              </g>
            );
          })}

          {/* x-axis labels (sparse) */}
          {points.map((p, i) => (
            <text
              key={p.date}
              x={xScale(i)}
              y={ih + 16}
              textAnchor="middle"
              fontSize={11}
              fill="#bbb"
              opacity={i % labelStride === 0 ? 1 : 0}
            >
              {i % labelStride === 0 ? fmtDay(p.date) : ""}
            </text>
          ))}

          <path d={pathD} fill="none" stroke="#ffffff" strokeWidth={2} />

          {points.map((p, i) => (
            <circle key={p.date} cx={xScale(i)} cy={yScale(p.minutes)} r={3} fill="#ffffff" />
          ))}
        </g>
      </svg>
    </div>
  );
}

