import {
  BookIcon,
  CalendarDayIcon,
  ChatIcon,
  ChecklistIcon,
  ClipboardIcon,
  GridIcon,
  LinkIcon,
  SchoolIcon,
  SettingsIcon,
} from './components/icons/NavigationIcons';

export const DEFAULT_PAGE = 'dashboard';
export const LAST_PAGE_KEY = 'tum-study-portal:last-page';

export const NAVIGATION_GROUPS = [
  {
    labelKey: 'sidebar.sectionOverview',
    items: [
      { id: 'dashboard', labelKey: 'sidebar.navDashboard', icon: GridIcon },
      { id: 'today', labelKey: 'sidebar.navToday', icon: CalendarDayIcon },
      { id: 'chat', labelKey: 'sidebar.navChat', icon: ChatIcon },
    ],
  },
  {
    labelKey: 'sidebar.sectionStudies',
    items: [
      { id: 'exams', labelKey: 'sidebar.navExams', icon: ClipboardIcon },
      { id: 'lectures', labelKey: 'sidebar.navLectures', icon: BookIcon },
      { id: 'todos', labelKey: 'sidebar.navTodos', icon: ChecklistIcon },
    ],
  },
  {
    labelKey: 'sidebar.sectionResources',
    items: [
      { id: 'modules', labelKey: 'sidebar.navModules', icon: SchoolIcon },
      { id: 'links', labelKey: 'sidebar.navLinks', icon: LinkIcon },
    ],
  },
  {
    labelKey: 'sidebar.sectionSystem',
    items: [
      { id: 'settings', labelKey: 'sidebar.navSettings', icon: SettingsIcon },
    ],
  },
];

export const NAVIGATION_ITEMS = NAVIGATION_GROUPS.flatMap(group => group.items);
export const PAGE_IDS = NAVIGATION_ITEMS.map(item => item.id);
const PAGE_ID_SET = new Set(PAGE_IDS);

export const MOBILE_TABS = [
  { id: 'today', labelKey: 'mobileShell.tabToday', icon: CalendarDayIcon },
  { id: 'todos', labelKey: 'mobileShell.tabTodos', icon: ChecklistIcon },
  { id: 'lectures', labelKey: 'mobileShell.tabLectures', icon: BookIcon },
  { id: 'chat', labelKey: 'mobileShell.tabChat', icon: ChatIcon },
];

export const MOBILE_MORE_ITEMS = ['dashboard', 'exams', 'modules', 'links', 'settings']
  .map(id => NAVIGATION_ITEMS.find(item => item.id === id));

export function isValidPage(page) {
  return PAGE_ID_SET.has(page);
}

export function pageFromPath(pathname = '') {
  const firstSegment = pathname
    .replace(/^\/+|\/+$/g, '')
    .split('/')[0]
    .toLowerCase();
  return isValidPage(firstSegment) ? firstSegment : null;
}

export function pageFromLocation(location, restoredPage) {
  const hashPath = location?.hash?.startsWith('#/') ? location.hash.slice(1) : '';
  const routePage = pageFromPath(hashPath || location?.pathname || '');
  if (routePage) return routePage;
  const pathname = location?.pathname || '';
  const isEntryPath = !hashPath && (
    pathname === ''
    || pathname === '/'
    || /\/index\.html$/.test(pathname)
  );
  return isEntryPath && isValidPage(restoredPage) ? restoredPage : DEFAULT_PAGE;
}

export function pageUrl(page, location = {}) {
  const safePage = isValidPage(page) ? page : DEFAULT_PAGE;
  return location.protocol === 'file:' ? `#/${safePage}` : `/${safePage}`;
}

export function mobileTabForPage(page) {
  return MOBILE_TABS.some(tab => tab.id === page) ? page : 'more';
}

