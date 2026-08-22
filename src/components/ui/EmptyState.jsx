import React from 'react';

/**
 * Einheitlicher leerer Zustand für Listen-Seiten (Exams, Lectures, Modules).
 */
export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}) {
  return (
    <div className="empty-state">
      {icon && <span className="empty-state-icon">{icon}</span>}
      <div className="empty-state-copy">
        <p className="empty-state-title">{title}</p>
        {description && <p className="empty-state-description">{description}</p>}
      </div>
      {(actionLabel && onAction) || (secondaryActionLabel && onSecondaryAction) ? (
        <div className="empty-state-actions">
          {actionLabel && onAction && (
            <button type="button" className="btn btn-primary" onClick={onAction}>
              {actionLabel}
            </button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <button type="button" className="btn btn-secondary" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
