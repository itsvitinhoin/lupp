import React from "react";

export function LuppLogo({ className = "" }: { className?: string }) {
  return (
    <img
      src="/luup-logo-blue.png"
      alt="Luup"
      className={`h-9 w-auto object-contain ${className}`}
    />
  );
}
