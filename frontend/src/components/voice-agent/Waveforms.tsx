export function AgentWaveform({ active }: { active: boolean }) {
  return (
    <div className="flex items-center justify-center gap-[2px] h-8">
      {Array.from({ length: 30 }).map((_, i) => (
        <div
          key={i}
          className="w-[2px] rounded-full bg-blue-400"
          style={{
            height: active ? `${4 + Math.sin(i * 0.5) * 12}px` : "3px",
            animation: active
              ? `agentWave ${0.7 + Math.random() * 0.6}s ease-in-out ${i * 35}ms infinite`
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
  return (
    <div className="flex items-center justify-center gap-[2px] h-16 w-full">
      {Array.from({ length: 28 }).map((_, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full bg-blue-400"
          style={{
            height: active ? `${12 + Math.sin(i * 0.5) * 16 + Math.random() * 10}px` : "4px",
            animation: active
              ? `agentWave ${0.6 + Math.random() * 0.8}s ease-in-out ${i * 40}ms infinite`
              : "none",
            opacity: active ? 0.85 : 0.3,
            transition: "height 0.3s ease",
          }}
        />
      ))}
    </div>
  );
}
