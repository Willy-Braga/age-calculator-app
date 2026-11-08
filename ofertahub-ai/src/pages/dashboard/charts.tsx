import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";

const axis = { tick: { fontSize: 11, fill: "var(--muted-foreground)" }, tickLine: false, axisLine: false } as const;
const tooltipStyle = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--foreground)" };

/** Série única ao longo do tempo: área com crosshair + tooltip; sem legenda (o título nomeia a série). */
export function TrendArea({ data, valueLabel, height = 220 }: { data: { label: string; value: number }[]; valueLabel: string; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label={`${valueLabel} por dia`}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--series-1)" stopOpacity={0.28} />
              <stop offset="1" stopColor="var(--series-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
          <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={16} />
          <YAxis allowDecimals={false} {...axis} width={40} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} formatter={(v) => [v, valueLabel]} />
          <Area type="monotone" dataKey="value" stroke="var(--series-1)" strokeWidth={2} fill="url(#trendFill)" activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras horizontais de magnitude. `colors` opcional quando a cor identifica a entidade (ex.: plataforma). */
export function HBars({ data, format, colors, height }: {
  data: { label: string; value: number }[]; format: (v: number) => string; colors?: string[]; height?: number;
}) {
  const h = height ?? Math.max(120, data.length * 34 + 16);
  return (
    <div style={{ height: h }} role="img" aria-label={data.map((d) => `${d.label}: ${format(d.value)}`).join("; ")}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke="var(--border)" strokeOpacity={0.6} />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" {...axis} width={110} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)", opacity: 0.5 }} formatter={(v) => [format(Number(v)), ""]} separator="" />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18} fill="var(--series-1)"
            label={{ position: "right", fontSize: 11, fill: "var(--muted-foreground)", formatter: (v: unknown) => format(Number(v)) }}>
            {colors && data.map((_, i) => <Cell key={i} fill={colors[i]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
