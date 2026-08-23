import React, { useEffect, useState } from 'react';
import { useLocale } from '../context/LocaleContext';
import {
  activateWaitingWorker,
  dismissIosInstallHint,
  registerServiceWorker,
  shouldShowIosInstallHint,
} from '../pwa';

export default function PwaStatus() {
  const { t } = useLocale();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [registration, setRegistration] = useState(null);
  const [installHint, setInstallHint] = useState(() => shouldShowIosInstallHint());
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    let active = true;
    registerServiceWorker({
      onUpdate: nextRegistration => {
        if (active) setRegistration(nextRegistration);
      },
    }).catch(() => {
      // The application remains online-only if registration is unavailable.
    });
    return () => {
      active = false;
    };
  }, []);

  const applyUpdate = () => {
    setActivating(true);
    // controllerchange is intentionally handled here so reload only follows a user action.
    const reload = () => window.location.reload();
    navigator.serviceWorker?.addEventListener('controllerchange', reload, { once: true });
    if (!activateWaitingWorker(registration)) {
      navigator.serviceWorker?.removeEventListener('controllerchange', reload);
      setActivating(false);
    }
  };

  const dismissInstall = () => {
    dismissIosInstallHint();
    setInstallHint(false);
  };

  return (
    <div className="pwa-status-stack">
      {online ? (
        <div className="pwa-connectivity pwa-connectivity-online" role="status">
          <span aria-hidden="true" />
          {t('pwa.online')}
        </div>
      ) : (
        <div className="pwa-banner pwa-banner-offline" role="status" aria-live="polite">
          <strong>{t('pwa.offlineTitle')}</strong>
          <span>{t('pwa.offlineBody')}</span>
        </div>
      )}
      {registration && (
        <div className="pwa-banner" role="status" aria-live="polite">
          <span>{t('pwa.updateAvailable')}</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={applyUpdate} disabled={activating}>
            {activating ? t('pwa.updating') : t('pwa.updateNow')}
          </button>
        </div>
      )}
      {installHint && (
        <aside className="pwa-banner pwa-install-hint" aria-label={t('pwa.installTitle')}>
          <span><strong>{t('pwa.installTitle')}</strong> {t('pwa.installBody')}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={dismissInstall}>
            {t('pwa.dismiss')}
          </button>
        </aside>
      )}
    </div>
  );
}
