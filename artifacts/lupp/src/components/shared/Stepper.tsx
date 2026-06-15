import React from 'react';
import { Check } from 'lucide-react';

interface StepperProps {
  steps: string[];
  currentStep: number;
}

export function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <div className="mb-8 flex items-center justify-between w-full relative">
      <div className="absolute left-0 top-1/2 -z-10 h-1 w-full -translate-y-1/2 bg-muted rounded-full"></div>
      <div 
        className="absolute left-0 top-1/2 -z-10 h-1 -translate-y-1/2 bg-primary rounded-full transition-all duration-300"
        style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
      ></div>
      
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;
        
        return (
          <div key={step} className="flex flex-col items-center">
            <div 
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
                isCompleted 
                  ? 'bg-primary border-primary text-primary-foreground' 
                  : isCurrent
                  ? 'bg-background border-primary text-primary'
                  : 'bg-background border-muted text-muted-foreground'
              }`}
            >
              {isCompleted ? <Check className="h-4 w-4" /> : <span>{index + 1}</span>}
            </div>
            <span className={`mt-2 text-xs font-medium absolute -bottom-6 whitespace-nowrap ${
              isCurrent ? 'text-foreground' : 'text-muted-foreground'
            }`}>
              {step}
            </span>
          </div>
        );
      })}
    </div>
  );
}
