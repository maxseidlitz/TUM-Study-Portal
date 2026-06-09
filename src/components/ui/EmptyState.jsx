import React from 'react';

/**
 * Einheitlicher leerer Zustand für Listen-Seiten (Exams, Lectures, Modules).
 */
export default function EmptyState({ icon, title, actionLabel, onAction }) {
  return (
    <div className="empty-state">
      {icon && <span style={{ fontSize: 48 }}>{icon}</span>}
      <p>{title}</p>
      {actionLabel && onAction && (
        <button type="button" className="btn btn-primary" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
