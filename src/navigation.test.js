import {
  DEFAULT_PAGE,
  MOBILE_MORE_ITEMS,
  MOBILE_TABS,
  NAVIGATION_ITEMS,
  isValidPage,
  mobileTabForPage,
  pageFromLocation,
  pageFromPath,
  pageUrl,
} from './navigation';

describe('navigation URL helpers', () => {
  test('maps direct paths and ignores trailing path parts', () => {
    expect(pageFromPath('/today')).toBe('today');
    expect(pageFromPath('/lectures/')).toBe('lectures');
    expect(pageFromPath('/unknown')).toBeNull();
  });

  test('restores the last valid page only at the app entry URL', () => {
    expect(pageFromLocation({ pathname: '/', hash: '' }, 'todos')).toBe('todos');
    expect(pageFromLocation({ pathname: '/index.html', hash: '' }, 'settings')).toBe('settings');
    expect(pageFromLocation({ pathname: '/unknown', hash: '' }, 'todos')).toBe(DEFAULT_PAGE);
    expect(pageFromLocation({ pathname: '/', hash: '' }, 'invalid')).toBe(DEFAULT_PAGE);
  });

  test('prefers direct routes and supports file URL hash routes', () => {
    expect(pageFromLocation({ pathname: '/', hash: '' }, 'todos')).toBe('todos');
    expect(pageFromLocation({ pathname: '/exams', hash: '' }, 'todos')).toBe('exams');
    expect(pageFromLocation({ pathname: '/build/index.html', hash: '#/chat' }, 'todos')).toBe('chat');
  });

  test('builds server paths and Electron-safe hash URLs', () => {
    expect(pageUrl('modules', { protocol: 'https:' })).toBe('/modules');
    expect(pageUrl('modules', { protocol: 'file:' })).toBe('#/modules');
    expect(pageUrl('invalid', { protocol: 'https:' })).toBe(`/${DEFAULT_PAGE}`);
  });
});

describe('mobile shell navigation state', () => {
  test('uses four direct destinations and groups secondary pages under More', () => {
    expect(MOBILE_TABS.map(item => item.id)).toEqual(['today', 'todos', 'lectures', 'chat']);
    expect(MOBILE_MORE_ITEMS.map(item => item.id)).toEqual([
      'dashboard',
      'exams',
      'modules',
      'links',
      'settings',
    ]);
    expect(mobileTabForPage('today')).toBe('today');
    expect(mobileTabForPage('settings')).toBe('more');
  });

  test('shared navigation definitions cover every valid page once', () => {
    const ids = NAVIGATION_ITEMS.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach(id => expect(isValidPage(id)).toBe(true));
  });
});
