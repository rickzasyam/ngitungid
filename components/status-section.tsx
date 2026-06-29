'use client'

import { Activity, Check, Loader2 } from 'lucide-react'

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
      {/* Section header — icon container + title + subtitle */}
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #daf163 0%, #c8e000 100%)' }}
        >
          <Activity className="w-4 h-4" style={{ color: '#1a1a1a' }} />
        </div>
        <div>
          <h3 className="text-sm font-bold" style={{ color: '#2d2d2d' }}>State: PDF Sedang Diekstrak</h3>
          <p className="text-xs" style={{ color: '#6b7280' }}>
            AI menjalankan OCR, table detection, dan parsing
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-3 animate-fade-in-up animation-delay-200">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-(--color-text-primary)">Progress</span>
          <span className="text-2xl font-bold text-(--color-accent-primary)">{progress}%</span>
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#f0f0f0' }}>
          <div
            className="h-full animate-shimmer rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>

      {/* Task Checklist */}
      <div className="space-y-1">
        {tasks.map((task, index) => (
          <div
            key={index}
            className="flex items-center gap-3 py-3 border-b last:border-0 animate-slide-up"
            style={{
              borderColor: '#f5f5f5',
              animationDelay: `${index * 60}ms`,
              opacity: 0,
              animationFillMode: 'forwards',
            }}
          >
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300"
              style={{
                background: task.completed ? '#daf163' : 'transparent',
                border: task.completed ? 'none' : '2px solid #e5e5e5',
              }}
            >
              {task.completed
                ? <Check className="w-2.5 h-2.5" style={{ color: '#1a1a1a' }} />
                : <Loader2 className="w-3 h-3 animate-spin" style={{ color: '#9ca3af' }} />}
            </div>
            <span
              className="text-sm transition-colors duration-200"
              style={{
                color: task.completed ? '#2d2d2d' : '#9ca3af',
                fontWeight: task.completed ? 500 : 400,
              }}
            >
              {task.label}
            </span>
            {task.completed && (
              <span className="ml-auto text-xs font-medium" style={{ color: '#bbb3f3' }}>
                Selesai
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
