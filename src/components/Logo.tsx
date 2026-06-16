import React from 'react';

interface LogoProps {
  variant?: 'full' | 'short' | 'icon';
  theme?: 'light' | 'dark';
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Logo: React.FC<LogoProps> = ({
  variant = 'full',
  theme = 'dark',
  className = '',
  size = 'md'
}) => {
  const uniqueId = React.useId().replace(/:/g, '');
  const gradLeftId = `ledgra-grad-left-${uniqueId}`;
  const gradRightId = `ledgra-grad-right-${uniqueId}`;
  const shadowId = `ledgra-shadow-${uniqueId}`;

  // Compute sizing dimensions
  const dimensions = {
    sm: { width: 32, height: 32, textClass: 'text-lg', labelClass: 'text-[9px]' },
    md: { width: 44, height: 44, textClass: 'text-2xl', labelClass: 'text-[11px]' },
    lg: { width: 56, height: 56, textClass: 'text-3xl', labelClass: 'text-xs' },
    xl: { width: 80, height: 80, textClass: 'text-4xl', labelClass: 'text-sm' }
  }[size];

  const textColor = theme === 'dark' ? 'text-white' : 'text-brand-navy';
  const subextColor = theme === 'dark' ? 'text-slate-300' : 'text-slate-500';

  return (
    <div className={`flex items-center gap-3 select-none ${className}`} style={{ direction: 'ltr' }}>
      {/* 3D Geometric Polygonal Logo Mark */}
      <svg
        width={dimensions.width}
        height={dimensions.height}
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 transition-transform hover:scale-105 duration-300"
      >
        <defs>
          {/* Main vertical polygonal gradient: Blue -> Turquoise */}
          <linearGradient id={gradLeftId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1E86E5" />
            <stop offset="100%" stopColor="#00C2A8" />
          </linearGradient>
          {/* Horizontal folded gradient: Blue -> Purple */}
          <linearGradient id={gradRightId} x1="05" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#00C2A8" />
            <stop offset="60%" stopColor="#1E86E5" />
            <stop offset="100%" stopColor="#7C5CFF" />
          </linearGradient>
          {/* Soft shadow */}
          <filter id={shadowId} x="-10%" y="-10%" width="130%" height="130%">
            <feDropShadow dx="2" dy="4" stdDeviation="3" floodColor="#0D182A" floodOpacity="0.15" />
          </filter>
        </defs>

        {/* Polygons composing the dynamic "L" fold */}
        <g filter={`url(#${shadowId})`}>
          {/* Left / Backbone Strip - Elegant Folded Polygon */}
          <path
            d="M20 15 L50 25 L50 100 L20 85 Z"
            fill={`url(#${gradLeftId})`}
          />
          {/* Right / Base Strip - Origami Overlap Folding Rightwards */}
          <path
            d="M50 100 L50 65 L95 80 L95 105 Z"
            fill={`url(#${gradRightId})`}
            opacity="0.95"
          />
          {/* Highlight Accent for high-end look */}
          <path
            d="M50 65 L20 85 L50 100 Z"
            fill="#FFFFFF"
            opacity="0.12"
          />
        </g>
      </svg>

      {/* Brand Text Elements (Lelg-aligned / RTL Wordmark) */}
      {variant !== 'icon' && (
        <div className="flex flex-col text-left font-sans">
          <div className="flex items-baseline gap-2">
            <span className={`font-bold tracking-wider leading-none font-mono ${dimensions.textClass} ${textColor}`}>
              LEDGRA
            </span>
            {variant === 'full' && (
              <span className={`font-bold font-sans opacity-95 leading-none ${dimensions.textClass} ${textColor}`} style={{ fontFamily: 'Tajawal' }}>
                لِدجرا
              </span>
            )}
          </div>
          {variant === 'full' && (
            <span className={`text-[9px] font-sans font-medium tracking-tight mt-0.5 leading-none ${subextColor}`} style={{ fontFamily: 'Tajawal', direction: 'rtl', textAlign: 'right' }}>
              نظام إدارة الأعمال والمحاسبة
            </span>
          )}
        </div>
      )}
    </div>
  );
};
export default Logo;
