import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

interface DeviceSelectProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

export default function DeviceSelect({ value, options, onChange }: DeviceSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const shortVal = value.length > 24 ? `${value.slice(0, 24)}…` : value;

  return (
    <div ref={ref} className="relative">
      <button
        data-testid="device-select"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors max-w-[160px]"
      >
        <span className="truncate">{shortVal}</span>
        <ChevronDown className="w-3 h-3 flex-shrink-0 opacity-60" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-[#1a1f2e] border border-white/15 rounded-md shadow-xl min-w-[220px] overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt}
              data-testid={`device-option-${opt}`}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                opt === value
                  ? "bg-blue-600/30 text-blue-300"
                  : "text-gray-300 hover:bg-white/8"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
