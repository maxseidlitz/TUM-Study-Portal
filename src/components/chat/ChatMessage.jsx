import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLocale } from '../../context/LocaleContext';
import { OLLAMA_TOOL_MODEL_RECOMMENDATIONS } from '../../utils/ollamaModels';
import { chatMarkdownComponents } from './chatMarkdown';

const defaultStyles = {
  msgRow: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  avatar: {
    width: 30, height: 30, borderRadius: 8, background: 'var(--bg-tertiary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0,
  },
  bubble: {
    maxWidth: '76%', minWidth: 0, padding: '10px 14px', borderRadius: 14,
    fontSize: 13, lineHeight: 1.6, wordBreak: 'break-word',
  },
  bubblePlain: { whiteSpace: 'pre-wrap', userSelect: 'text', WebkitUserSelect: 'text' },
  bubbleUser: { background: 'var(--accent)', color: '#fff', borderBottomRightRadius: 4 },
  bubbleAi: { background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderBottomLeftRadius: 4 },
  bubbleError: { background: 'var(--danger-subtle)', borderColor: 'var(--danger)', color: 'var(--text-primary)' },
  fallbackNotice: {
    marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--warning)',
    color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.45,
  },
  fallbackModels: { display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  fallbackModel: {
    fontFamily: 'monospace', background: 'var(--warning-subtle)',
    border: '1px solid var(--warning)', borderRadius: 5, padding: '2px 5px',
  },
};

const compactStyles = {
  msgRow: { display: 'flex', width: '100%' },
  bubble: {
    maxWidth: '85%', padding: '8px 12px', borderRadius: 12,
    fontSize: 12, lineHeight: 1.5, wordBreak: 'break-word',
  },
  bubbleUser: { background: 'var(--accent)', color: '#fff', borderBottomRightRadius: 2 },
  bubbleAi: { background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderBottomLeftRadius: 2 },
  bubbleError: { background: 'var(--danger-subtle)', borderColor: 'var(--danger)' },
};

function resolveDisplay(msg, t) {
  const isUser = msg.role === 'user';
  let displayPlain = isUser;
  let displayContent = typeof msg.content === 'string' ? msg.content : '';

  if (!isUser && msg.variant === 'todo_saved' && Array.isArray(msg.todoActions)) {
    displayPlain = true;
    const lines = msg.todoActions.map(
      (a) => t('chat.todoLine', { title: a.title, priority: t(`priority.${a.priority || 'medium'}`) }),
    );
    displayContent = msg.todoActions.length === 1
      ? `${t('chat.todoSavedOne')}\n${lines.join('\n')}`
      : `${t('chat.todoSavedMany')}\n${lines.join('\n')}`;
  } else if (!isUser && msg.error && msg.errorKind) {
    displayPlain = true;
    if (msg.errorKind === 'failed') {
      displayContent = t('chat.errorFailed', { error: msg.errorDetail || t('common.unknownError') });
    } else {
      displayContent = t('chat.errorPrefix', { message: msg.errorDetail || '' });
    }
  } else if (!isUser && msg.error) {
    displayPlain = true;
    displayContent = typeof msg.content === 'string' ? msg.content : '';
  } else if (!isUser) {
    displayPlain = false;
    displayContent = typeof msg.content === 'string' ? msg.content : '';
  }

  return { isUser, displayPlain, displayContent };
}

/**
 * Einzelne Chat-Nachricht (Vollansicht oder Mini-Chat via variant="compact").
 */
export default function ChatMessage({ msg, variant = 'full', showAvatar = true }) {
  const { t } = useLocale();
  const styles = variant === 'compact' ? compactStyles : defaultStyles;
  const { isUser, displayPlain, displayContent } = resolveDisplay(msg, t);
  const showFallback = !isUser && msg.fallbackUsed && msg.variant !== 'todo_saved';

  return (
    <div style={{ ...styles.msgRow, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      {!isUser && showAvatar && variant === 'full' && (
        <div style={defaultStyles.avatar}>{msg.error ? '⚠️' : '🤖'}</div>
      )}
      <div
        style={{
          ...styles.bubble,
          ...(displayPlain && variant === 'full' ? defaultStyles.bubblePlain : {}),
          ...(isUser ? styles.bubbleUser : styles.bubbleAi),
          ...(msg.error ? styles.bubbleError : {}),
        }}
      >
        {displayPlain ? (
          displayContent
        ) : (
          <div className="chat-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={chatMarkdownComponents}>
              {displayContent}
            </ReactMarkdown>
          </div>
        )}
        {showFallback && (
          <div style={defaultStyles.fallbackNotice} role="status">
            <strong>{t('chat.retrievalFallbackTitle', { model: msg.activeModel || msg.model || 'Ollama' })}</strong>
            <div>{t('chat.retrievalFallbackBody')}</div>
            <div style={defaultStyles.fallbackModels}>
              {OLLAMA_TOOL_MODEL_RECOMMENDATIONS.map(({ id }) => (
                <code key={id} style={defaultStyles.fallbackModel}>ollama pull {id}</code>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
