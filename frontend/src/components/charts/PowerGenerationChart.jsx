import { useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatTimestamp } from '../../utils/date';
import { ChartCard } from './ChartCard';
import styles from './PowerGenerationChart.module.css';

function CustomTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipTitle}>{formatTimestamp(point.timestamp)}</div>
      {point.actual_power_kw !== null && point.actual_power_kw !== undefined ? (
        <div className={styles.tooltipRow}>
          <span>Actual Generation</span>
          <strong className="mono" style={{ color: 'var(--color-accent)' }}>
            {Number(point.actual_power_kw).toLocaleString(undefined, { maximumFractionDigits: 1 })} kW
          </strong>
        </div>
      ) : null}
      {point.predicted_power_kw !== null && point.predicted_power_kw !== undefined ? (
        <div className={styles.tooltipRow}>
          <span>Predicted Output</span>
          <strong className="mono" style={{ color: 'var(--color-predicted)' }}>
            {Number(point.predicted_power_kw).toLocaleString(undefined, { maximumFractionDigits: 1 })} kW
          </strong>
        </div>
      ) : null}
      {point.irradiation !== null && point.irradiation !== undefined ? (
        <div className={styles.tooltipRow}>
          <span>Irradiation</span>
          <strong className="mono" style={{ color: 'var(--color-teal)' }}>
            {Number(point.irradiation).toFixed(2)} kW/m²
          </strong>
        </div>
      ) : null}
    </div>
  );
}

export function PowerGenerationChart({
  data = [],
  dateWindow,
  onChangeWindow,
  loading = false,
  error = null,
  onRetry,
}) {
  const [showActual, setShowActual] = useState(true);
  const [showPredicted, setShowPredicted] = useState(true);
  const [showIrradiation, setShowIrradiation] = useState(false);

  const actions = (
    <div className={styles.controls}>
      <button
        type="button"
        className={`${styles.toggleChip} ${!showActual ? styles.toggleChipMuted : ''}`}
        onClick={() => setShowActual((v) => !v)}
        aria-pressed={showActual}
      >
        <span className={styles.swatch} style={{ backgroundColor: '#f59e0b' }} />
        <span>Actual (kW)</span>
      </button>

      <button
        type="button"
        className={`${styles.toggleChip} ${!showPredicted ? styles.toggleChipMuted : ''}`}
        onClick={() => setShowPredicted((v) => !v)}
        aria-pressed={showPredicted}
      >
        <span className={styles.swatch} style={{ backgroundColor: '#60a5fa' }} />
        <span>Predicted (kW)</span>
      </button>

      <button
        type="button"
        className={`${styles.toggleChip} ${!showIrradiation ? styles.toggleChipMuted : ''}`}
        onClick={() => setShowIrradiation((v) => !v)}
        aria-pressed={showIrradiation}
      >
        <span className={styles.swatch} style={{ backgroundColor: '#2dd4bf' }} />
        <span>Irradiation</span>
      </button>

      {onChangeWindow ? (
        <select
          aria-label="Chart time range"
          className="select-field"
          style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }}
          value={dateWindow}
          onChange={(e) => onChangeWindow(e.target.value)}
        >
          <option value="24h">Last 24h</option>
          <option value="7d">Last 7d</option>
          <option value="30d">Last 30d</option>
        </select>
      ) : null}
    </div>
  );

  return (
    <ChartCard
      title="Solar Generation & ML Forecast"
      subtitle="Aggregated fleet AC power (kW) comparing SCADA/meter readings against SVR predictions"
      actions={actions}
      loading={loading}
      error={error}
      isEmpty={!data || data.length === 0}
      emptyTitle="No generation telemetry in range"
      emptyDescription="Adjust the date window or ensure forecast and reading records exist."
      onRetry={onRetry}
      height={330}
    >
      <div style={{ width: '100%', height: 330 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="tejasActualFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.34} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="tejasPredFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.22} />
                <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.01} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="var(--text-muted)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              yAxisId="power"
              stroke="var(--text-muted)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} MW` : `${v} kW`)}
            />
            {showIrradiation ? (
              <YAxis
                yAxisId="irr"
                orientation="right"
                stroke="#2dd4bf"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                domain={[0, 1.4]}
                tickFormatter={(v) => `${v.toFixed(1)}`}
              />
            ) : null}

            <Tooltip content={<CustomTooltip />} />

            {showPredicted ? (
              <Area
                yAxisId="power"
                type="monotone"
                dataKey="predicted_power_kw"
                name="Predicted (kW)"
                stroke="#60a5fa"
                strokeWidth={2}
                strokeDasharray="5 4"
                fill="url(#tejasPredFill)"
                connectNulls
              />
            ) : null}

            {showActual ? (
              <Area
                yAxisId="power"
                type="monotone"
                dataKey="actual_power_kw"
                name="Actual (kW)"
                stroke="#f59e0b"
                strokeWidth={2.5}
                fill="url(#tejasActualFill)"
                activeDot={{ r: 5, fill: '#f59e0b', stroke: '#ffffff', strokeWidth: 2 }}
                connectNulls
              />
            ) : null}

            {showIrradiation ? (
              <Line
                yAxisId="irr"
                type="monotone"
                dataKey="irradiation"
                name="Irradiation (kW/m²)"
                stroke="#2dd4bf"
                strokeWidth={1.75}
                dot={false}
                connectNulls
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
