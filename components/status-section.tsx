'use client'

import { CheckCircle2, Loader2 } from 'lucide-react'

export function StatusSection() {
  const progress = 64

  const tasks = [
    { label: 'OCR text extraction', completed: true },
    { label: 'Table detection', completed: true },
    { label: 'Financial statement parsing', completed: false },
    { label: 'Confidence scoring', completed: false },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-(--color-text-primary) mb-0.5">State: PDF Sedang Diekstrak</h2>
        <p className="text-(--color-text-muted) text-sm">
          AI menjalankan OCR, table detection, dan financial statement parsing.
        </p>
      </div>

      {/* Progress Bar */}
      <div className="space-y-3 animate-fade-in-up animation-delay-200">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-(--color-text-primary)">Progress</span>
          <span className="text-2xl font-bold text-(--color-accent-primary)">{progress}%</span>
        </div>
        <div className="w-full h-3 bg-(--color-muted-dark) rounded-full overflow-hidden shadow-[inset_0_2px_4px_rgb(0,0,0,0.04)]">
          <div
            className="h-full animate-shimmer rounded-full transition-all duration-500 shadow-[0_0_12px_rgb(218,241,99,0.4)]"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>

      {/* Task Checklist */}
      <div className="space-y-2 animate-fade-in-up animation-delay-300">
        {tasks.map((task, index) => (
          <div key={index} className="flex items-center gap-3 p-3 bg-(--color-muted-bg) rounded-2xl hover:bg-(--color-border-subtle) transition-all duration-300 shadow-[0_2px_6px_rgb(0,0,0,0.02)]">
            {task.completed ? (
              <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center
                              justify-center flex-shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
            ) : (
              <div className="w-7 h-7 rounded-full bg-(--color-accent-primary)/15
                              flex items-center justify-center flex-shrink-0">
                <Loader2 className="w-4 h-4 text-(--color-accent-primary) animate-spin" />
              </div>
            )}
            <span
              className={`text-sm transition-colors ${
                task.completed ? 'text-(--color-text-primary) font-medium' : 'text-(--color-text-muted)'
              }`}
            >
              {task.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
