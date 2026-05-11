interface FlagProps {
  className?: string;
}

export function FlagUS({ className = 'w-5 h-3.5' }: FlagProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 60 40"
      className={className}
      aria-label="US flag"
    >
      {/* Stripes */}
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
        <rect
          key={i}
          x="0"
          y={i * (40 / 13)}
          width="60"
          height={40 / 13}
          fill={i % 2 === 0 ? '#B22234' : '#FFFFFF'}
        />
      ))}
      {/* Blue canton */}
      <rect x="0" y="0" width="24" height={40 * (7 / 13)} fill="#3C3B6E" />
      {/* Stars — 5 rows of 6 and 4 rows of 5 alternating */}
      {Array.from({ length: 50 }).map((_, i) => {
        const row = Math.floor(i / (i < 30 ? 6 : 5));
        const isEvenRow = row % 2 === 0;
        const col = i < 30 ? i % 6 : i % 5;
        const x = isEvenRow ? 2 + col * 4 : 4 + col * 4;
        const y = 1.8 + row * 2.15;
        return (
          <text key={i} x={x} y={y} fontSize="2.2" textAnchor="middle" fill="#FFFFFF">
            ★
          </text>
        );
      })}
    </svg>
  );
}

export function FlagUK({ className = 'w-5 h-3.5' }: FlagProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 60 40"
      className={className}
      aria-label="UK flag"
    >
      {/* Blue background */}
      <rect width="60" height="40" fill="#012169" />
      {/* White diagonal cross (St Andrew) */}
      <line x1="0" y1="0" x2="60" y2="40" stroke="#FFFFFF" strokeWidth="8" />
      <line x1="60" y1="0" x2="0" y2="40" stroke="#FFFFFF" strokeWidth="8" />
      {/* Red diagonal cross (St Patrick) — clipped to quadrants */}
      <line x1="0" y1="0" x2="60" y2="40" stroke="#C8102E" strokeWidth="4" />
      <line x1="60" y1="0" x2="0" y2="40" stroke="#C8102E" strokeWidth="4" />
      {/* White cross (St George) */}
      <rect x="24" y="0" width="12" height="40" fill="#FFFFFF" />
      <rect x="0" y="14" width="60" height="12" fill="#FFFFFF" />
      {/* Red cross (St George) */}
      <rect x="26" y="0" width="8" height="40" fill="#C8102E" />
      <rect x="0" y="16" width="60" height="8" fill="#C8102E" />
    </svg>
  );
}
