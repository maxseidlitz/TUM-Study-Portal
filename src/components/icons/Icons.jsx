import React from 'react';

function SvgIcon({ size = 16, strokeWidth = 2, children, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export function PlusIcon({ size = 16, strokeWidth = 2 }) {
  return (
    <SvgIcon size={size} strokeWidth={strokeWidth}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </SvgIcon>
  );
}

export function CloseIcon({ size = 16 }) {
  return (
    <SvgIcon size={size}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </SvgIcon>
  );
}

export function EditIcon({ size = 14 }) {
  return (
    <SvgIcon size={size}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </SvgIcon>
  );
}

export function TrashIcon({ size = 14 }) {
  return (
    <SvgIcon size={size}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </SvgIcon>
  );
}

export function SendIcon({ size = 18 }) {
  return (
    <SvgIcon size={size}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </SvgIcon>
  );
}

export function CalIcon({ size = 15 }) {
  return (
    <SvgIcon size={size}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </SvgIcon>
  );
}

export function LogIcon({ size = 13 }) {
  return (
    <SvgIcon size={size}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </SvgIcon>
  );
}

export function GradeIcon({ size = 13 }) {
  return (
    <SvgIcon size={size}>
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" />
    </SvgIcon>
  );
}

export function SyncIcon({ size = 16 }) {
  return (
    <SvgIcon size={size}>
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <polyline points="21 3 21 8 16 8" />
    </SvgIcon>
  );
}

export function RefreshIcon({ size = 13 }) {
  return (
    <SvgIcon size={size}>
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </SvgIcon>
  );
}

export function CheckIcon({ size = 12, strokeWidth = 3 }) {
  return (
    <SvgIcon size={size} strokeWidth={strokeWidth}>
      <polyline points="20 6 9 17 4 12" />
    </SvgIcon>
  );
}

export function ExternalIcon({ size = 14 }) {
  return (
    <SvgIcon size={size}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </SvgIcon>
  );
}
