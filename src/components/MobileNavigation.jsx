import React, { useEffect, useRef, useState } from 'react';
import { useLocale } from '../context/LocaleContext';
import {
  MOBILE_MORE_ITEMS,
  MOBILE_TABS,
  NAVIGATION_ITEMS,
  mobileTabForPage,
} from '../navigation';
import AppLogo from './icons/AppLogo';
import { MoreIcon } from './icons/NavigationIcons';
import AccessibleDialog from './ui/AccessibleDialog';

export function MobileTopBar({ activePage }) {
  const { t } = useLocale();
  const item = NAVIGATION_ITEMS.find(candidate => candidate.id === activePage);

  return (
    <header className="mobile-top-bar">
      <div className="mobile-app-mark">
        <AppLogo size={36} decorative />
      </div>
      <div className="mobile-top-copy">
        <span className="mobile-app-name">{t('mobileShell.appName')}</span>
        <strong className="mobile-page-title">{t(item?.labelKey || 'sidebar.navDashboard')}</strong>
      </div>
    </header>
  );
}

export function MobileBottomNavigation({ activePage, onNavigate }) {
  const { t } = useLocale();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef(null);
  const activeTab = mobileTabForPage(activePage);

  useEffect(() => {
    setMoreOpen(false);
  }, [activePage]);

  const navigate = (page) => {
    setMoreOpen(false);
    onNavigate(page);
  };

  return (
    <>
      {moreOpen && (
        <AccessibleDialog
          onClose={() => setMoreOpen(false)}
          ariaLabel={t('mobileShell.more')}
          overlayClassName="mobile-more-dialog"
          className="mobile-more-sheet"
        >
            <div className="mobile-more-heading">{t('mobileShell.more')}</div>
            <div className="mobile-more-grid">
              {MOBILE_MORE_ITEMS.map(item => {
                const Icon = item.icon;
                const active = activePage === item.id;
                return (
                  <button
                    type="button"
                    className={`mobile-more-item${active ? ' active' : ''}`}
                    key={item.id}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => navigate(item.id)}
                  >
                    <Icon size={22} />
                    <span>{t(item.labelKey)}</span>
                  </button>
                );
              })}
            </div>
        </AccessibleDialog>
      )}

      <nav className="mobile-tab-bar" aria-label={t('mobileShell.primaryNavigation')}>
        {MOBILE_TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              type="button"
              className={`mobile-tab${active ? ' active' : ''}`}
              key={tab.id}
              aria-current={active ? 'page' : undefined}
              onClick={() => navigate(tab.id)}
            >
              <Icon size={22} />
              <span>{t(tab.labelKey)}</span>
            </button>
          );
        })}
        <button
          type="button"
          ref={moreButtonRef}
          className={`mobile-tab${activeTab === 'more' || moreOpen ? ' active' : ''}`}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          aria-current={activeTab === 'more' ? 'page' : undefined}
          onClick={() => setMoreOpen(open => !open)}
        >
          <MoreIcon size={22} />
          <span>{t('mobileShell.more')}</span>
        </button>
      </nav>
    </>
  );
}
