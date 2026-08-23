import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ExamFormModal from './ExamFormModal';

describe('ExamFormModal accessibility', () => {
  let host;
  let root;

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
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
    vi.restoreAllMocks();
    global.IS_REACT_ACT_ENVIRONMENT = false;
  });

  test('associates every visible form label with its control', () => {
    const labels = {
      'exams.fieldName': 'Name',
      'exams.fieldDate': 'Date',
      'exams.fieldTime': 'Time',
      'exams.fieldRoom': 'Room',
      'exams.fieldCredits': 'Credits',
      'exams.fieldNotes': 'Notes',
      'exams.modalNew': 'New exam',
      'common.close': 'Close',
      'common.cancel': 'Cancel',
      'common.add': 'Add',
    };
    act(() => {
      root.render(
        <ExamFormModal
          form={{ name: '', date: '', time: '', room: '', credits: '', notes: '' }}
          setForm={() => {}}
          onSubmit={() => {}}
          onClose={() => {}}
          t={key => labels[key] || key}
        />,
      );
    });

    document.querySelectorAll('[role="dialog"] label').forEach(label => {
      expect(label.htmlFor).not.toBe('');
      expect(label.control).not.toBeNull();
    });
  });
});
