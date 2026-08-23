import React, { useMemo } from 'react';
import { useLocale } from '../context/LocaleContext';
import { openExternal } from '../utils/helpers';

function buildLinkGroups(t) {
  return [
    {
      title: t('links.gMain'),
      links: [
        { name: t('links.tumWeb_n'), url: 'https://www.tum.de', description: t('links.tumWeb_d'), icon: '🏛️', color: '#0065bd' },
        { name: t('links.tumOnline_n'), url: 'https://campus.tum.de', description: t('links.tumOnline_d'), icon: '🎓', color: '#0065bd' },
        { name: t('links.myTum_n'), url: 'https://myportal.tum.de', description: t('links.myTum_d'), icon: '👤', color: '#3B82F6' },
      ],
    },
    {
      title: t('links.gStudy'),
      links: [
        { name: t('links.moodle_n'), url: 'https://www.moodle.tum.de', description: t('links.moodle_d'), icon: '📚', color: '#F59E0B' },
        { name: t('links.library_n'), url: 'https://www.ub.tum.de', description: t('links.library_d'), icon: '📖', color: '#10B981' },
        { name: t('links.examsOffice_n'), url: 'https://www.tum.de/studium/im-studium/studienorganisation/pruefungen', description: t('links.examsOffice_d'), icon: '📋', color: '#8B5CF6' },
      ],
    },
    {
      title: t('links.gSupport'),
      links: [
        { name: t('links.lrz_n'), url: 'https://www.lrz.de/services/', description: t('links.lrz_d'), icon: '💻', color: '#06B6D4' },
        { name: t('links.stuve_n'), url: 'https://www.sv.tum.de', description: t('links.stuve_d'), icon: '🤝', color: '#EC4899' },
        { name: t('links.advising_n'), url: 'https://www.tum.de/studium/studienberatung', description: t('links.advising_d'), icon: '💬', color: '#F97316' },
      ],
    },
    {
      title: t('links.gTools'),
      links: [
        { name: t('links.roomfinder_n'), url: 'https://nav.tum.de', description: t('links.roomfinder_d'), icon: '🗺️', color: '#6366F1' },
        { name: t('links.canteen_n'), url: 'https://www.studierendenwerk-muenchen-oberbayern.de/speiseplan/', description: t('links.canteen_d'), icon: '🍽️', color: '#EF4444' },
        { name: t('links.calc_n'), url: 'https://www.sv.tum.de/sv/referate/hochschulpolitik/notenhilfe/', description: t('links.calc_d'), icon: '🧮', color: '#14B8A6' },
      ],
    },
  ];
}

export default function Links() {
  const { t } = useLocale();
  const linkGroups = useMemo(() => buildLinkGroups(t), [t]);

  return (
    <div className="links-page">
      <div className="page-header">
        <h1>{t('links.title')}</h1>
        <p>{t('links.subtitle')}</p>
      </div>

      <div style={styles.groups}>
        {linkGroups.map(group => (
          <div key={group.title}>
            <div className="section-title">{group.title}</div>
            <div className="link-grid" style={styles.linkGrid}>
              {group.links.map(link => (
                <LinkCard key={link.url} link={link} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={styles.hint}>
        <InfoIcon />
        <span>{t('links.hint')}</span>
      </div>
    </div>
  );
}

function LinkCard({ link }) {
  return (
    <button
      className="card"
      onClick={() => openExternal(link.url)}
      style={styles.card}
    >
      <div style={styles.cardLeft}>
        <div style={{ ...styles.iconWrap, background: `${link.color}22`, border: `1px solid ${link.color}44` }}>
          <span style={{ fontSize: 22 }}>{link.icon}</span>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={styles.linkName}>{link.name}</div>
          <div style={styles.linkDesc}>{link.description}</div>
        </div>
      </div>
      <ExternalIcon color={link.color} />
    </button>
  );
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}
function ExternalIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color || 'var(--text-muted)'} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, opacity: 0.7 }}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

const styles = {
  groups: { display: 'flex', flexDirection: 'column', gap: 28 },
  linkGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginBottom: 4 },
  card: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    cursor: 'pointer',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-card)',
    textAlign: 'left',
    transition: 'all var(--transition)',
    width: '100%',
    fontFamily: 'var(--font-sans)',
  },
  cardLeft: { display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 },
  iconWrap: {
    width: 48, height: 48, borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  linkName: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 },
  linkDesc: { fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 },
  hint: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 32,
    padding: '12px 16px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: 10,
    fontSize: 12,
    color: 'var(--text-muted)',
    lineHeight: 1.5,
  },
};
