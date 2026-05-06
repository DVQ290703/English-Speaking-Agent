import type { CSSProperties } from 'react';

type Rounded = 'md' | 'lg' | 'xl' | '2xl' | 'full';

const ROUNDED_CLASS: Record<Rounded, string> = {
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  full: 'rounded-full',
};

type SkeletonProps = {
  className?: string;
  style?: CSSProperties;
  rounded?: Rounded;
};

export default function Skeleton({ className = '', style, rounded = 'lg' }: SkeletonProps) {
  return (
    <div
      style={style}
      className={`animate-pulse bg-gray-200/80 dark:bg-slate-800/70 ${ROUNDED_CLASS[rounded]} ${className}`}
    />
  );
}
