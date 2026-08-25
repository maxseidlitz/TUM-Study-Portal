import React from 'react';

export default function AppLogo({ size = 36, decorative = false, title = 'TUM Study Portal' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={decorative ? 'presentation' : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <rect width="64" height="64" rx="14" fill="#0065BD" />
      <path fill="#FFFFFF" d="M30.7 22.2 12.2 30.8v18.6L30.7 40.8Z" />
      <path fill="#E4F0FA" d="M33.3 22.2 51.8 30.8v18.6L33.3 40.8Z" />
    </svg>
  );
}
