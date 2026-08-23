import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter(element => {
      const style = window.getComputedStyle(element);
      return !element.hidden
        && element.getAttribute('aria-hidden') !== 'true'
        && style.display !== 'none'
        && style.visibility !== 'hidden';
    });
}

let openDialogs = 0;

export default function AccessibleDialog({
  open = true,
  onClose,
  labelledBy,
  ariaLabel,
  children,
  className = '',
  overlayClassName = '',
  style,
  closeOnBackdrop = true,
  closeOnEscape = true,
  initialFocusRef,
}) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const appRoot = document.getElementById('root');
    openDialogs += 1;
    if (openDialogs === 1 && appRoot) {
      appRoot.setAttribute('inert', '');
      appRoot.setAttribute('aria-hidden', 'true');
    }

    const frame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      const target = initialFocusRef?.current
        || dialog?.querySelector('[data-dialog-initial-focus]')
        || getFocusableElements(dialog)[0]
        || dialog;
      target?.focus();
    });

    const onKeyDown = (event) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (event.key === 'Escape' && closeOnEscape && onCloseRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      openDialogs = Math.max(0, openDialogs - 1);
      if (openDialogs === 0 && appRoot) {
        appRoot.removeAttribute('inert');
        appRoot.removeAttribute('aria-hidden');
      }
      previouslyFocused?.focus?.();
    };
  }, [closeOnEscape, initialFocusRef, open]);

  if (!open) return null;

  return createPortal(
    <div
      className={`dialog-overlay ${overlayClassName}`.trim()}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className={`dialog-surface ${className}`.trim()}
        style={style}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={ariaLabel}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
