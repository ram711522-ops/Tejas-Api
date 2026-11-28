export function SolarOrientationDial({ tilt, azimuth, size = 56 }) {
  const hasTilt = tilt !== null && tilt !== undefined && !Number.isNaN(Number(tilt));
  const hasAz = azimuth !== null && azimuth !== undefined && !Number.isNaN(Number(azimuth));
  const azDeg = hasAz ? ((Number(azimuth) % 360) + 360) % 360 : 180;
  const tiltDeg = hasTilt ? Math.min(90, Math.max(0, Number(tilt))) : 20;

  // Polar to SVG angle: 0 deg = North (up, -90 deg in SVG)
  const rad = ((azDeg - 90) * Math.PI) / 180;
  const x2 = 32 + Math.cos(rad) * 20;
  const y2 = 32 + Math.sin(rad) * 20;

  // Tilt arc scale (0..90 deg mapped onto inner radius ring)
  const innerCirc = 2 * Math.PI * 14;
  const tiltArc = (tiltDeg / 90) * innerCirc;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-label={`Array tilt ${hasTilt ? `${tiltDeg}°` : 'N/A'}, azimuth ${hasAz ? `${azDeg}°` : 'N/A'}`}
      style={{ flexShrink: 0 }}
    >
      {/* Outer azimuth ring */}
      <circle
        cx="32"
        cy="32"
        r="27"
        fill="var(--bg-surface-muted)"
        stroke="var(--border-subtle)"
        strokeWidth="1"
      />
      {/* Cardinal ticks */}
      <line x1="32" y1="3" x2="32" y2="7" stroke="var(--text-muted)" strokeWidth="1" />
      <line x1="61" y1="32" x2="57" y2="32" stroke="var(--text-muted)" strokeWidth="1" />
      <line x1="32" y1="61" x2="32" y2="57" stroke="var(--text-muted)" strokeWidth="1" />
      <line x1="3" y1="32" x2="7" y2="32" stroke="var(--text-muted)" strokeWidth="1" />

      {/* Tilt inclination arc */}
      <circle
        cx="32"
        cy="32"
        r="14"
        fill="none"
        stroke="var(--border-subtle)"
        strokeWidth="2.5"
      />
      {hasTilt ? (
        <circle
          cx="32"
          cy="32"
          r="14"
          fill="none"
          stroke="var(--color-predicted)"
          strokeWidth="2.5"
          strokeDasharray={`${tiltArc} ${innerCirc}`}
          transform="rotate(-90 32 32)"
          strokeLinecap="round"
        />
      ) : null}

      {/* Azimuth bearing needle */}
      {hasAz ? (
        <>
          <line
            x1="32"
            y1="32"
            x2={x2}
            y2={y2}
            stroke="var(--color-accent)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx={x2} cy={y2} r="3" fill="var(--color-accent-bright)" />
        </>
      ) : null}

      <circle cx="32" cy="32" r="2.5" fill="var(--text-primary)" />
    </svg>
  );
}
