import type { CSSProperties } from 'react';

type SpinnerProps = {
  size?: number;
  className?: string;
  color?: string;
  label?: string;
};

export default function Spinner({
  size = 16,
  className = '',
  color = 'currentColor',
  label,
}: SpinnerProps) {
  const style: CSSProperties = {
    width: size,
    height: size,
    borderColor: `${color}40`,
    borderTopColor: color,
    borderWidth: Math.max(2, Math.round(size / 8)),
  };
  return (
    <span
      role="status"
      aria-label={label || 'Loading'}
      className={`inline-block rounded-full border-solid animate-spin ${className}`}
      style={style}
    />
  );
}
