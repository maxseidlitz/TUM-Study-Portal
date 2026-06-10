import React from 'react';

export const chatMarkdownComponents = {
  a({ href, children, ...props }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  },
  table({ children, ...props }) {
    return (
      <div className="chat-md-table-wrap">
        <table {...props}>{children}</table>
      </div>
    );
  },
};
