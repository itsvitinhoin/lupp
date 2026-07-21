import React from 'react';

interface PhonePreviewProps {
  children: React.ReactNode;
  className?: string;
}

export function PhonePreview({ children, className = '' }: PhonePreviewProps) {
  return (
    <div className={`relative mx-auto aspect-[9/19.5] w-full max-w-[320px] rounded-[3rem] border-[8px] border-slate-900 bg-background shadow-2xl shadow-primary/10 overflow-hidden ${className}`}>
      {/* Dynamic Island / Notch */}
      <div className="absolute left-1/2 top-0 z-50 h-6 w-32 -translate-x-1/2 rounded-b-[1.25rem] bg-foreground"></div>
      
      {/* Content */}
      <div className="h-full w-full overflow-y-auto overflow-x-hidden bg-background">
        {children}
      </div>
      
      {/* Home Indicator */}
      <div className="absolute bottom-2 left-1/2 z-50 h-1 w-1/3 -translate-x-1/2 rounded-full bg-card/40"></div>
    </div>
  );
}
