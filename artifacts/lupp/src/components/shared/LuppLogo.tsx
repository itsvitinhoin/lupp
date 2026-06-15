import React from 'react';

export function LuppLogo({ className = '' }: { className?: string }) {
  return (
    <img
      src="/luup-logo-white.png"
      alt="Luup"
      className={`h-8 w-auto object-contain ${className}`}
    />
  );
}
