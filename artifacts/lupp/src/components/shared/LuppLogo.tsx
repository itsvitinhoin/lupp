import React from 'react';

export function LuppLogo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 font-bold tracking-tight ${className}`}>
      <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/20">
        <div className="absolute inset-0.5 rounded-[10px] bg-background"></div>
        <div className="relative h-3 w-3 rounded-full bg-gradient-to-br from-primary to-accent"></div>
        <div className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-accent"></div>
      </div>
      <span className="text-xl bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">Lupp</span>
    </div>
  );
}
