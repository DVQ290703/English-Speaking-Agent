import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectDropdownProps<T extends string> {
  value: T;
  options: T[];
  onChange: (value: T) => void;
  className?: string;
}

export default function SelectDropdown<T extends string>({
  value,
  options,
  onChange,
  className = '',
}: SelectDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        data-testid={`select-${value}`}
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-700 hover:bg-gray-100 transition-colors border border-gray-200 bg-white"
      >
        <span>{value}</span>
        <ChevronDown className="w-3 h-3 opacity-50" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 z-50 bg-white border border-gray-200 rounded-md shadow-lg min-w-40 overflow-hidden">
          {options.map(opt => (
            <button
              key={opt}
              data-testid={`option-${opt}`}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                opt === value
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
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
