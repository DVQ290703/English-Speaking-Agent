import { useState } from 'react';
import { ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import type { ToolCallStep } from '../../api/chat';

interface ReasoningStepsProps {
  steps: ToolCallStep[];
  defaultOpen?: boolean;
}

export default function ReasoningSteps({ steps, defaultOpen = false }: ReasoningStepsProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (steps.length === 0) return null;

  const totalMs = steps.reduce((sum, s) => sum + (s.duration_ms ?? 0), 0);
  const hasAnyDuration = steps.some((s) => s.duration_ms != null);

  return (
    <div className="mt-1.5 w-full text-xs">
      {/* Collapsed bar */}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-500 transition-colors dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800 dark:text-slate-400"
      >
        <span className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />
          <span>
            {steps.length} tool call{steps.length !== 1 ? 's' : ''}
            {hasAnyDuration ? ` · ${totalMs}ms` : ''}
          </span>
        </span>
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {/* Expanded timeline */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="border border-t-0 border-slate-200 rounded-b-lg bg-white px-3 py-2.5 flex flex-col dark:border-slate-700 dark:bg-slate-900">
              {steps.map((step, i) => (
                <div key={i} className="flex gap-2.5">
                  {/* Timeline dot + connector line */}
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full mt-0.5 flex-shrink-0',
                        step.status === 'completed' ? 'bg-emerald-400' : 'bg-red-400',
                      )}
                    />
                    {i < steps.length - 1 && (
                      <div className="w-px flex-1 bg-slate-100 mt-1 dark:bg-slate-700" />
                    )}
                  </div>

                  {/* Step content */}
                  <div className={cn('flex-1 min-w-0', i < steps.length - 1 && 'pb-3')}>
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <span className="font-semibold text-slate-700 truncate dark:text-slate-200">
                        {step.tool_name}
                      </span>
                      {step.duration_ms != null && (
                        <span className="text-slate-400 flex-shrink-0">{step.duration_ms}ms</span>
                      )}
                    </div>

                    {/* Result label */}
                    <span
                      className={cn(
                        'text-[11px] leading-snug',
                        step.status === 'failed'
                          ? 'text-red-500 dark:text-red-400'
                          : 'text-slate-500 dark:text-slate-400',
                      )}
                    >
                      {step.status === 'failed'
                        ? (step.error ?? 'Error')
                        : step.result_label || step.output_summary || '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
