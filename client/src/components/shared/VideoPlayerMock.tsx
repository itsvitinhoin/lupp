import React from 'react';

export function VideoPlayerMock({ className = '', gradient = 'from-indigo-900 to-slate-900' }: { className?: string, gradient?: string }) {
  return (
    <div className={`relative h-full w-full overflow-hidden bg-gradient-to-br ${gradient} ${className}`}>
      {/* Decorative noise/texture overlay */}
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>
      
      {/* Abstract shapes for visual interest */}
      <div className="absolute -left-1/4 -top-1/4 h-1/2 w-1/2 rounded-full bg-primary/20 blur-[60px]"></div>
      <div className="absolute -bottom-1/4 -right-1/4 h-1/2 w-1/2 rounded-full bg-accent/20 blur-[60px]"></div>
    </div>
  );
}
