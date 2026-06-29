'use client'

interface HeaderProps {
  currentStep: number
}

export function Header({ currentStep }: HeaderProps) {
  const steps = [
    { number: 1, label: 'Upload' },
    { number: 2, label: 'Review' },
    { number: 3, label: 'Mapping' },
  ]

  return (
    <div className="bg-white border-b border-[#f0f0f0] flex-shrink-0">
      {/* Title row */}
      <div className="px-8 py-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-(--color-text-primary)">
            Upload Data Keuangan
          </h1>
          <p className="text-(--color-text-muted) text-sm mt-0.5">
            Ingest data dari spreadsheet terstruktur atau PDF laporan keuangan
            dengan ekstraksi AI.
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="px-8 pb-4">
        <div className="flex items-center gap-2">
          {steps.map((step, index) => (
            <div key={step.number} className="flex items-center gap-2">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center
                                text-xs font-bold transition-all duration-300
                                ${currentStep >= step.number
                                  ? 'bg-(--color-accent-primary) text-(--color-accent-primary-fg) shadow-[0_4px_12px_rgb(218,241,99,0.4)]'
                                  : 'bg-(--color-muted-bg) text-(--color-text-muted)'
                                }`}>
                  {step.number}
                </div>
                <span className={`text-sm font-medium transition-colors
                                  ${currentStep >= step.number
                                    ? 'text-(--color-text-primary)'
                                    : 'text-(--color-text-muted)'
                                  }`}>
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div className={`w-12 h-px mx-1 transition-colors duration-300
                                 ${currentStep > step.number
                                   ? 'bg-(--color-accent-primary)'
                                   : 'bg-(--color-muted-dark)'
                                 }`} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
