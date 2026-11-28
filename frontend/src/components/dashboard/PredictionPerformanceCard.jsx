import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatusIndicator } from '../data-display/StatusIndicator';
import styles from './PredictionPerformanceCard.module.css';

export function PredictionPerformanceCard({ summary, comparison }) {
  const actual = summary?.currentGenerationKw;
  const predicted = summary?.predictedGenerationKw;
  const maxRef = Math.max(actual || 0, predicted || 0, 1);

  const actualPct = actual !== null && actual !== undefined ? Math.min(100, (actual / maxRef) * 100) : 0;
  const predPct =
    predicted !== null && predicted !== undefined ? Math.min(100, (predicted / maxRef) * 100) : 0;

  const devPct = summary?.deviationPercent;
  const badgeTone =
    devPct === null || devPct === undefined
      ? 'neutral'
      : devPct > 25
      ? 'danger'
      : devPct > 10
      ? 'warning'
      : 'success';

  const accuracy = summary?.accuracy;

  return (
    <section className={`surface-card ${styles.card}`}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Prediction Performance</h3>
          <p className={styles.subtitle}>Actual vs. predicted fleet generation alignment</p>
        </div>

        <StatusIndicator
          tone={badgeTone}
          label={devPct !== null && devPct !== undefined ? `${devPct}% Fleet Delta` : 'No Pair'}
        />
      </div>

      <div className={styles.barBlock}>
        <div className={styles.barRow}>
          <div className={styles.barLabelRow}>
            <span>Actual Fleet Output</span>
            <strong className="mono">
              {actual !== null && actual !== undefined ? `${actual.toLocaleString()} kW` : '—'}
            </strong>
          </div>
          <div className={styles.track}>
            <div className={styles.fillActual} style={{ width: `${actualPct}%` }} />
          </div>
        </div>

        <div className={styles.barRow}>
          <div className={styles.barLabelRow}>
            <span>Predicted Fleet Output</span>
            <strong className="mono">
              {predicted !== null && predicted !== undefined
                ? `${predicted.toLocaleString()} kW`
                : '—'}
            </strong>
          </div>
          <div className={styles.track}>
            <div className={styles.fillPredicted} style={{ width: `${predPct}%` }} />
          </div>
        </div>
      </div>

      <div className={styles.metricsRow}>
        <div className={styles.metricBox}>
          <div className={styles.metricName}>Daytime MAE</div>
          <div className={`mono ${styles.metricVal}`}>
            {accuracy?.maeKw !== null && accuracy?.maeKw !== undefined
              ? `${accuracy.maeKw} kW`
              : '—'}
          </div>
        </div>

        <div className={styles.metricBox}>
          <div className={styles.metricName}>Daytime RMSE</div>
          <div className={`mono ${styles.metricVal}`}>
            {accuracy?.rmseKw !== null && accuracy?.rmseKw !== undefined
              ? `${accuracy.rmseKw} kW`
              : '—'}
          </div>
        </div>

        <div className={styles.metricBox}>
          <div className={styles.metricName}>Matched Pairs</div>
          <div className={`mono ${styles.metricVal}`}>{accuracy?.count ?? 0}</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span className={styles.note}>
          {comparison
            ? `Latest check (${comparison.plant_id}): ${comparison.deviation_detected ? 'Deviation flagged' : 'Within threshold'}`
            : 'Computed from matched daytime forecast & reading pairs.'}
        </span>
        <Link
          to="/analytics"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--color-accent)',
            whiteSpace: 'nowrap',
          }}
        >
          <span>Analytics</span>
          <ArrowRight size={13} />
        </Link>
      </div>
    </section>
  );
}
