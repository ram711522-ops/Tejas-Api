import { ArrowRight, Compass, Radio, ShieldCheck, Sun, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import styles from './SolarObservatoryHero.module.css';

export function SolarObservatoryHero({
  summary,
  plantsCount = 0,
  weatherEntry = null,
  dateWindow = '7d',
}) {
  const actualKw = summary?.currentGenerationKw;
  const predictedKw = summary?.predictedGenerationKw;
  const capacityKw = summary?.totalCapacityKw || 0;

  const capPct =
    actualKw !== null && actualKw !== undefined && capacityKw > 0
      ? Math.min(100, Math.max(0, (actualKw / capacityKw) * 100))
      : 0;

  const predPct =
    predictedKw !== null && predictedKw !== undefined && capacityKw > 0
      ? Math.min(100, Math.max(0, (predictedKw / capacityKw) * 100))
      : 0;

  const weather = weatherEntry?.weather;
  const irradiation = weather?.irradiation_kw_m2;
  const irradianceNormalized =
    irradiation !== null && irradiation !== undefined ? Math.min(1, Math.max(0.15, irradiation / 1.1)) : 0.48;

  // Arc math for r = 92 (circumference ~ 578)
  const radius = 92;
  const circumference = 2 * Math.PI * radius;
  const actualArc = (capPct / 100) * circumference;
  const predArc = (predPct / 100) * circumference;

  const producingCount =
    summary?.plantCards?.filter((p) => p.status === 'Producing').length ?? 0;
  const warningCount =
    summary?.plantCards?.filter((p) => p.status === 'Warning').length ?? 0;

  return (
    <section className={styles.stage} aria-label="Solar Observatory Stage">
      <div className={styles.ambientFlare} style={{ opacity: 0.35 + irradianceNormalized * 0.45 }} />

      <div className={styles.grid}>
        {/* Left/Center: Animated Solar Corona & Orbital Telemetry Dial */}
        <div className={styles.orbitalPane}>
          <div className={styles.dialWrap} aria-hidden="true">
            <svg viewBox="0 0 280 280" className={styles.dialSvg}>
              <defs>
                <radialGradient id="observatoryCore" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#fde68a" stopOpacity="0.95" />
                  <stop offset="32%" stopColor="#f59e0b" stopOpacity="0.6" />
                  <stop offset="68%" stopColor="#ff7a1a" stopOpacity="0.16" />
                  <stop offset="100%" stopColor="#ff7a1a" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="actualRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="100%" stopColor="#ff7a1a" />
                </linearGradient>
              </defs>

              {/* Outer azimuth tick ring */}
              <g className={styles.orbitSlow}>
                <circle
                  cx="140"
                  cy="140"
                  r="128"
                  fill="none"
                  stroke="var(--border-subtle)"
                  strokeWidth="1"
                  strokeDasharray="2 8"
                />
                {Array.from({ length: 24 }).map((_, idx) => {
                  const angle = (idx * 15 * Math.PI) / 180;
                  const r1 = idx % 2 === 0 ? 118 : 122;
                  const r2 = 128;
                  return (
                    <line
                      key={idx}
                      x1={140 + Math.cos(angle) * r1}
                      y1={140 + Math.sin(angle) * r1}
                      x2={140 + Math.cos(angle) * r2}
                      y2={140 + Math.sin(angle) * r2}
                      stroke={idx % 6 === 0 ? 'var(--color-accent)' : 'var(--border-strong)'}
                      strokeWidth={idx % 6 === 0 ? '1.5' : '1'}
                    />
                  );
                })}
              </g>

              {/* Counter-rotating orbital telemetry ring */}
              <g className={styles.orbitReverse}>
                <circle
                  cx="140"
                  cy="140"
                  r="106"
                  fill="none"
                  stroke="rgba(56, 189, 248, 0.24)"
                  strokeWidth="1"
                  strokeDasharray="16 10 4 10"
                />
                <circle cx="140" cy="34" r="3" fill="var(--color-predicted)" />
                <circle cx="246" cy="140" r="2.5" fill="var(--color-accent)" />
              </g>

              {/* Capacity track & Forecast overlay arc */}
              <circle
                cx="140"
                cy="140"
                r={radius}
                fill="none"
                stroke="var(--border-subtle)"
                strokeWidth="6"
              />
              <circle
                cx="140"
                cy="140"
                r={radius}
                fill="none"
                stroke="rgba(56, 189, 248, 0.42)"
                strokeWidth="3"
                strokeDasharray={`${predArc} ${circumference}`}
                strokeDashoffset="0"
                transform="rotate(-90 140 140)"
                strokeLinecap="round"
              />
              {/* Actual capacity generation arc */}
              <circle
                cx="140"
                cy="140"
                r={radius}
                fill="none"
                stroke="url(#actualRingGrad)"
                strokeWidth="6"
                strokeDasharray={`${actualArc} ${circumference}`}
                strokeDashoffset="0"
                transform="rotate(-90 140 140)"
                strokeLinecap="round"
              />

              {/* Inner pulsing solar corona */}
              <circle
                cx="140"
                cy="140"
                r={52 + irradianceNormalized * 16}
                fill="url(#observatoryCore)"
                className={styles.coronaPulse}
              />
              <circle
                cx="140"
                cy="140"
                r="42"
                fill="var(--bg-surface)"
                fillOpacity="0.72"
                stroke="var(--border-accent)"
                strokeWidth="1"
              />
            </svg>

            <div className={styles.dialCenter}>
              <span className={styles.dialMicro}>LOAD FACTOR</span>
              <strong className={`font-display tabular-nums ${styles.dialPct}`}>
                {capPct.toFixed(1)}%
              </strong>
              <span className={styles.dialSub}>
                {summary?.totalCapacityMw ?? 0} MW FLEET
              </span>
            </div>
          </div>

          <div className={styles.heroReadout}>
            <div className={styles.eyebrowRow}>
              <span className={styles.sectorTag}>
                <Radio size={12} />
                <span>HELIOSTAT TELEMETRY ARRAY</span>
              </span>
              <span className={styles.windowPill}>{dateWindow.toUpperCase()} WINDOW</span>
            </div>

            <div className={styles.heroNumberBlock}>
              <div className={styles.heroValue}>
                <span className="font-display tabular-nums">
                  {actualKw !== null && actualKw !== undefined
                    ? actualKw.toLocaleString(undefined, { maximumFractionDigits: 1 })
                    : '—'}
                </span>
                <span className={styles.heroUnit}>kW</span>
              </div>
              <p className={styles.heroCaption}>
                Instantaneous fleet AC output across <strong>{plantsCount}</strong> monitored solar
                arrays ({producingCount} active{warningCount > 0 ? `, ${warningCount} flagged` : ''}).
              </p>
            </div>

            <div className={styles.heroMiniBar}>
              <div className={styles.miniMetric}>
                <Sun size={13} style={{ color: 'var(--color-accent)' }} />
                <span>
                  IRRADIANCE{' '}
                  <strong className="mono">
                    {irradiation !== null && irradiation !== undefined
                      ? `${Number(irradiation).toFixed(2)} kW/m²`
                      : '—'}
                  </strong>
                </span>
              </div>
              <div className={styles.miniMetric}>
                <Zap size={13} style={{ color: 'var(--color-predicted)' }} />
                <span>
                  SVR TARGET{' '}
                  <strong className="mono">
                    {predictedKw !== null && predictedKw !== undefined
                      ? `${predictedKw.toLocaleString()} kW`
                      : '—'}
                  </strong>
                </span>
              </div>
              <div className={styles.miniMetric}>
                <Compass size={13} style={{ color: 'var(--color-teal)' }} />
                <span>
                  SITE{' '}
                  <strong className="mono">
                    {weatherEntry ? weatherEntry.plant_id : 'FLEET'}
                  </strong>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Hairline Architectural Telemetry Spine */}
        <aside className={styles.spine} aria-label="Observatory Diagnostics">
          <div className={styles.spineCell}>
            <div className={styles.spineLabel}>SOLAR MODEL ALIGNMENT</div>
            <div className={styles.spineMain}>
              <span className="font-display tabular-nums">
                {summary?.deviationPercent !== null && summary?.deviationPercent !== undefined
                  ? `${Math.max(0, 100 - summary.deviationPercent).toFixed(1)}%`
                  : '—'}
              </span>
              <span className={styles.spineTag}>
                {summary?.accuracy?.maeKw !== null && summary?.accuracy?.maeKw !== undefined
                  ? `MAE ${summary.accuracy.maeKw} kW`
                  : 'CALIBRATING'}
              </span>
            </div>
            <p className={styles.spineNote}>
              {summary?.netResidualKw !== null && summary?.netResidualKw !== undefined
                ? `Residual variance ${summary.netResidualKw >= 0 ? '+' : ''}${summary.netResidualKw} kW against forecast curve`
                : 'Awaiting aligned forecast & SCADA pair'}
            </p>
          </div>

          <div className={styles.spineCell}>
            <div className={styles.spineLabel}>PROTECTION & DEVIATION GUARD</div>
            <div className={styles.spineMain}>
              <span className="font-display tabular-nums">
                {summary?.activeAlertsCount === 0 ? 'CLEAR' : `${summary?.activeAlertsCount} ACTIVE`}
              </span>
              <ShieldCheck
                size={18}
                style={{
                  color:
                    summary?.highSeverityActive > 0
                      ? 'var(--color-danger)'
                      : summary?.activeAlertsCount > 0
                      ? 'var(--color-warning)'
                      : 'var(--color-success)',
                }}
              />
            </div>
            <p className={styles.spineNote}>
              {summary?.openAlertsCount ?? 0} unacknowledged • {summary?.highSeverityActive ?? 0} high severity
            </p>
          </div>

          <div className={styles.spineFooter}>
            <Link to="/forecasts" className={styles.spineLink}>
              <span>SVR Solar Simulator</span>
              <ArrowRight size={13} />
            </Link>
            <Link to="/analytics" className={styles.spineLink}>
              <span>Deviation Diagnostics</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </aside>
      </div>
    </section>
  );
}
