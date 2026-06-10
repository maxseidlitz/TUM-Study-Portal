import React, { useState, useEffect } from 'react';
import { Joyride, STATUS } from 'react-joyride';
import { useLocale } from '../context/LocaleContext';

export default function OnboardingTour() {
  const { t } = useLocale();
  const [run, setRun] = useState(false);

  useEffect(() => {
    // Prüfen ob die Tour bereits gemacht wurde
    const hasSeenTour = localStorage.getItem('tourCompleted');
    if (!hasSeenTour) {
      // Kleiner Delay damit die App fertig geladen ist
      const timer = setTimeout(() => setRun(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const steps = [
    {
      target: 'body',
      placement: 'center',
      title: t('onboarding.step1Title'),
      content: t('onboarding.step1Body'),
      disableBeacon: true,
    },
    {
      target: '[data-tour-id="dashboard-stats"]',
      title: t('onboarding.step2Title'),
      content: t('onboarding.step2Body'),
    },
    {
      target: '[data-tour-id="nav-chat"]',
      title: t('onboarding.step3Title'),
      content: t('onboarding.step3Body'),
    },
    {
      target: '[data-tour-id="nav-lectures"]',
      title: t('onboarding.step4Title'),
      content: t('onboarding.step4Body'),
    },
    {
      target: '[data-tour-id="nav-modules"]',
      title: t('onboarding.step5Title'),
      content: t('onboarding.step5Body'),
    },
    {
      target: 'body',
      placement: 'center',
      title: t('onboarding.step6Title'),
      content: t('onboarding.step6Body'),
    },
  ];

  const handleJoyrideCallback = (data) => {
    const { status } = data;
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
      localStorage.setItem('tourCompleted', 'true');
      setRun(false);
    }
  };

  return (
    <Joyride
      run={run}
      steps={steps}
      continuous
      showProgress
      showSkipButton
      callback={handleJoyrideCallback}
      locale={{
        back: t('onboarding.back'),
        close: t('onboarding.close'),
        last: t('onboarding.last'),
        next: t('onboarding.next'),
        skip: t('onboarding.skip'),
      }}
      styles={{
        options: {
          zIndex: 10000,
          primaryColor: 'var(--accent)',
          textColor: 'var(--text-primary)',
          backgroundColor: 'var(--bg-card)',
          arrowColor: 'var(--bg-card)',
        },
        buttonNext: {
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          padding: '8px 16px',
        },
        buttonBack: {
          color: 'var(--text-secondary)',
          marginRight: 10,
        },
        buttonSkip: {
          color: 'var(--text-muted)',
        },
        tooltip: {
          borderRadius: 14,
          padding: 20,
          border: '1px solid var(--border-color)',
        },
        tooltipTitle: {
          fontFamily: 'var(--font-serif)',
          fontSize: 18,
          fontWeight: 700,
          marginBottom: 10,
        },
        tooltipContent: {
          fontSize: 14,
          lineHeight: 1.5,
          color: 'var(--text-secondary)',
        },
      }}
    />
  );
}
