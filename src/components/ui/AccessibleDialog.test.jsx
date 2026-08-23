import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AccessibleDialog, { getFocusableElements } from './AccessibleDialog';

describe('AccessibleDialog', () => {
  let host;
  let root;
  let animationFrameSpy;

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    animationFrameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callback();
      return 1;
    });
    host = document.createElement('div');
    host.id = 'root';
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
    animationFrameSpy.mockRestore();
    global.IS_REACT_ACT_ENVIRONMENT = false;
  });

  test('discovers enabled focus targets only', () => {
    const container = document.createElement('div');
    container.innerHTML = '<button>one</button><button disabled>two</button><a href="/">three</a>';
    expect(getFocusableElements(container).map(node => node.textContent)).toEqual(['one', 'three']);
  });

  test('renders modal semantics, traps Tab, closes on Escape, and restores focus', () => {
    const trigger = document.createElement('button');
    document.body.insertBefore(trigger, host);
    trigger.focus();
    const onClose = vi.fn();

    act(() => {
      root.render(
        <AccessibleDialog onClose={onClose} labelledBy="test-title">
          <h2 id="test-title">Title</h2>
          <button>First</button>
          <button>Last</button>
        </AccessibleDialog>,
      );
    });
    const dialog = document.querySelector('[role="dialog"]');
    const buttons = dialog.querySelectorAll('button');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('test-title');
    expect(host.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);

    buttons[1].focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(buttons[0]);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(buttons[1]);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => root.render(null));
    expect(host.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });
});
