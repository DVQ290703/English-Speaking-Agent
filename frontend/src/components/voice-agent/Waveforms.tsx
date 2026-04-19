import { useMemo } from "react";

// Pre-compute stable random durations so they don't change on every re-render
function useStableRandom(count: number, seed: number) {
  return useMemo(() => {
    const values: number[] = [];
    let s = seed;
    for (let i = 0; i < count; i++) {
      s = (s * 9301 + 49297) % 233280;
      values.push(s / 233280);
    }
    return values;
  }, [count, seed]);
}

export function AgentWaveform({ active }: { active: boolean }) {
  const randoms = useStableRandom(30, 42);

  return (
    <div className="flex items-center justify-center gap-0.5 h-8">
      {Array.from({ length: 30 }).map((_, i) => (
        <div
          key={i}
          className="w-0.5 rounded-full bg-blue-500"
          style={{
            height: active ? `${4 + Math.sin(i * 0.5) * 12}px` : "3px",
            animation: active
              ? `agentWave ${0.7 + randoms[i] * 0.6}s ease-in-out ${i * 35}ms infinite`
              : "none",
            opacity: active ? 0.8 : 0.25,
            transition: "height 0.3s ease",
          }}
        />
      ))}
    </div>
  );
}

export function MicWaveform({ active }: { active: boolean }) {
  const randoms = useStableRandom(28, 77);

  return (
    <div className="flex items-center justify-center gap-0.5 h-16 w-full">
      {Array.from({ length: 28 }).map((_, i) => (
        <div
          key={i}
          className="w-0.75 rounded-full bg-blue-500"
          style={{
            height: active ? `${12 + Math.sin(i * 0.5) * 16 + randoms[i] * 10}px` : "4px",
            animation: active
              ? `agentWave ${0.6 + randoms[i] * 0.8}s ease-in-out ${i * 40}ms infinite`
              : "none",
            opacity: active ? 0.85 : 0.3,
            transition: "height 0.3s ease",
          }}
        />
      ))}
    </div>
  );
}
