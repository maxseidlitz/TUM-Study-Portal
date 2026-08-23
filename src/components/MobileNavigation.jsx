import React, { useEffect, useRef, useState } from 'react';
import { useLocale } from '../context/LocaleContext';
import {
  MOBILE_MORE_ITEMS,
  MOBILE_TABS,
  NAVIGATION_ITEMS,
  mobileTabForPage,
} from '../navigation';
import { MoreIcon } from './icons/NavigationIcons';

export function MobileTopBar({ activePage }) {
  const { t } = useLocale();
  const item = NAVIGATION_ITEMS.find(candidate => candidate.id === activePage);

  return (
    <header className="mobile-top-bar">
      <div className="mobile-app-mark" aria-hidden="true">TUM</div>
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

  useEffect(() => {
    if (!moreOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMoreOpen(false);
        moreButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moreOpen]);

  const navigate = (page) => {
    setMoreOpen(false);
    onNavigate(page);
  };

  return (
    <>
      {moreOpen && (
        <div className="mobile-more-layer">
          <button
            type="button"
            className="mobile-more-backdrop"
            aria-label={t('mobileShell.closeMore')}
            onClick={() => setMoreOpen(false)}
          />
          <section className="mobile-more-sheet" role="dialog" aria-modal="true" aria-label={t('mobileShell.more')}>
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
          </section>
        </div>
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
          onClick={() => setMoreOpen(open => !open)}
        >
          <MoreIcon size={22} />
          <span>{t('mobileShell.more')}</span>
        </button>
      </nav>
    </>
  );
}
