import React, { useEffect, useMemo, useState } from 'react';
import { EditIcon, TrashIcon } from '../icons/Icons';
import {
  addDays,
  dateToDayCode,
  formatWeekRangeTitle,
  isSameCalendarDay,
} from '../../utils/helpers';
import {
  DISPLAY_START_MIN,
  DISPLAY_END_MIN,
  layoutLecturesForDay,
  lectureToRawInterval,
} from '../../utils/weekGridLayout';

const PX_PER_MIN = 1.15;
const MIN_DAY_COL_PX = 112;
const TIME_GUTTER_PX = 52;
const DISPLAY_MINUTES = DISPLAY_END_MIN - DISPLAY_START_MIN;
const GRID_BODY_HEIGHT = DISPLAY_MINUTES * PX_PER_MIN;

const HOURS = [];
for (let h = 8; h <= 20; h += 1) HOURS.push(h);

function formatHourLabel(h) {
  return `${String(h).padStart(2, '0')}:00`;
}

function nowMinutesLocal() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

function formatClock(m) {
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export default function WeekTimeGridView({
  weekMonday,
  setWeekOffset,
  weekColumnLectures,
  dayNames,
  onEdit,
  onDelete,
  intlLocale,
  weekAbbr,
  t,
}) {
  const nowMidnight = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const sunday = useMemo(() => addDays(weekMonday, 6), [weekMonday]);
  const title = useMemo(() => formatWeekRangeTitle(weekMonday, sunday, intlLocale, weekAbbr), [weekMonday, sunday, intlLocale, weekAbbr]);

  const columns = useMemo(() => (
    Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekMonday, i);
      const code = dateToDayCode(date);
      const short = dayNames[code] || code;
      const dayNum = date.toLocaleDateString(intlLocale, { day: 'numeric' });
      const monthShort = date.toLocaleDateString(intlLocale, { month: 'short' });
      return { date, code, short, dayNum, monthShort };
    })
  ), [weekMonday, dayNames, intlLocale]);

  const weekHasToday = useMemo(
    () => columns.some((col) => isSameCalendarDay(col.date, nowMidnight)),
    [columns, nowMidnight],
  );

  const [, clockTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => clockTick((x) => x + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const nowLineTop = useMemo(() => {
    void clockTick;
    if (!weekHasToday) return null;
    const n = nowMinutesLocal();
    if (n < DISPLAY_START_MIN || n >= DISPLAY_END_MIN) return null;
    return (n - DISPLAY_START_MIN) * PX_PER_MIN;
  }, [weekHasToday, clockTick]);

  const maxAllDayCount = useMemo(
    () => weekColumnLectures.reduce((m, col) => Math.max(m, (col || []).filter((l) => l.allDay).length), 0),
    [weekColumnLectures],
  );
  const allDayStripHeight = maxAllDayCount === 0 ? 0 : Math.min(120, 6 + maxAllDayCount * 34);
  const timeGutterTotalHeight = allDayStripHeight + GRID_BODY_HEIGHT;

  return (
    <div className="week-grid-view" style={styles.wrap}>
      <div className="week-grid-toolbar" style={styles.toolbar}>
        <div className="week-grid-toolbar-buttons" style={styles.toolbarBtns}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setWeekOffset((w) => w - 1)}>
            {t('lectures.prevWeek')}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setWeekOffset(0)}>
            {t('lectures.thisWeek')}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setWeekOffset((w) => w + 1)}>
            {t('lectures.nextWeek')}
          </button>
        </div>
        <div style={styles.weekTitle}>{title}</div>
      </div>

      <p style={styles.disclaimer} title={t('lectures.weekDisclaimer')}>
        {t('lectures.weekGridShort')}
      </p>

      <div className="week-grid-scroll" style={styles.scrollOuter} tabIndex={0} role="region" aria-label={t('lectures.weekGridScrollLabel')}>
        <div style={styles.headerRow}>
          <div style={{ ...styles.cornerCell, width: TIME_GUTTER_PX, minWidth: TIME_GUTTER_PX }} aria-hidden />
          {columns.map((col, i) => {
            const isToday = isSameCalendarDay(col.date, nowMidnight);
            return (
              <div
                key={col.date.getTime()}
                style={{
                  ...styles.dayHeadCell,
                  minWidth: MIN_DAY_COL_PX,
                  borderRight: i < 6 ? '1px solid var(--border-subtle)' : 'none',
                  ...(isToday ? styles.dayHeadToday : {}),
                }}
              >
                <span style={styles.dayHeadShort}>{col.short}</span>
                <span style={styles.dayHeadNum}>{col.dayNum}.</span>
                <span style={styles.dayHeadMonth}>{col.monthShort}</span>
                {isToday && <span className="badge badge-accent" style={{ marginTop: 4 }}>{t('lectures.today')}</span>}
              </div>
            );
          })}
        </div>

        <div style={{ ...styles.gridRow, alignItems: 'stretch', minHeight: timeGutterTotalHeight }}>
          <div style={{ ...styles.timeGutter, width: TIME_GUTTER_PX, minWidth: TIME_GUTTER_PX, height: timeGutterTotalHeight }}>
            {allDayStripHeight > 0 && <div style={{ height: allDayStripHeight, flexShrink: 0 }} aria-hidden />}
            <div style={{ position: 'relative', height: GRID_BODY_HEIGHT, flexShrink: 0 }}>
            {HOURS.slice(0, -1).map((h) => {
              const top = (h * 60 - DISPLAY_START_MIN) * PX_PER_MIN;
              return (
                <div key={h} style={{ ...styles.timeLabel, top }}>
                  {formatHourLabel(h)}
                </div>
              );
            })}
            </div>
          </div>

          <div style={styles.dayColumnsWrap}>
            <div style={styles.dayColumns}>
              {columns.map((col, colIndex) => {
                const isToday = isSameCalendarDay(col.date, nowMidnight);
                const colLectures = weekColumnLectures[colIndex] || [];
                const allDayItems = colLectures.filter((l) => l.allDay);
                const timed = colLectures.filter((l) => !l.allDay);
                const items = layoutLecturesForDay(timed);
                return (
                  <div
                    key={col.date.getTime()}
                    style={{
                      ...styles.dayColumn,
                      minWidth: MIN_DAY_COL_PX,
                      borderRight: colIndex < 6 ? '1px solid var(--border-subtle)' : 'none',
                      ...(isToday ? styles.dayColumnToday : {}),
                    }}
                  >
                    <div
                      style={{
                        ...styles.allDayStrip,
                        minHeight: allDayStripHeight || 0,
                        maxHeight: allDayStripHeight || undefined,
                        overflowY: allDayStripHeight ? 'auto' : 'hidden',
                        borderBottom: allDayStripHeight ? '1px solid var(--border-subtle)' : 'none',
                        background: allDayStripHeight ? 'var(--bg-tertiary)' : 'transparent',
                      }}
                    >
                      {allDayItems.map((lec) => (
                        <button
                          key={lec.id}
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => onEdit(lec)}
                          style={styles.allDayChip}
                          title={lec.name}
                        >
                          <span style={styles.allDayChipText}>{lec.name}</span>
                          <span style={styles.allDayChipBadge}>{t('lectures.allDay')}</span>
                        </button>
                      ))}
                    </div>
                    <div style={{ ...styles.dayColumnGrid, height: GRID_BODY_HEIGHT }}>
                    <div style={styles.hourLines}>
                      {HOURS.slice(0, -1).map((h) => (
                        <div
                          key={h}
                          style={{
                            ...styles.hourLine,
                            top: (h * 60 - DISPLAY_START_MIN) * PX_PER_MIN,
                          }}
                        />
                      ))}
                    </div>

                    {items.map((item) => (
                      <GridEventBlock
                        key={item.id}
                        item={item}
                        pxPerMin={PX_PER_MIN}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        t={t}
                      />
                    ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {nowLineTop != null && (
              <div
                style={{ ...styles.nowLineOverlay, top: allDayStripHeight + nowLineTop }}
                title={t('lectures.nowLine', { time: formatClock(nowMinutesLocal()) })}
              >
                <div style={styles.nowLineBarFull} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GridEventBlock({ item, pxPerMin, onEdit, onDelete, t }) {
  const { lecture, startMin, endMin, columnIndex, columnCount } = item;
  const [hover, setHover] = useState(false);
  const top = (startMin - DISPLAY_START_MIN) * pxPerMin;
  const height = Math.max((endMin - startMin) * pxPerMin, 22);
  const widthPct = 100 / columnCount;
  const leftPct = widthPct * columnIndex;
  const pad = columnCount > 1 ? 1 : 2;

  const timeStr = useMemo(() => {
    if (lecture.allDay) return t('lectures.allDay');
    const raw = lectureToRawInterval(lecture);
    if (!raw) return '';
    const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return `${fmt(raw.startMin)}–${fmt(raw.endMin)}`;
  }, [lecture, t]);

  return (
    <div
      role="button"
      tabIndex={0}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit(lecture);
        }
      }}
      onClick={() => onEdit(lecture)}
      style={{
        position: 'absolute',
        left: `calc(${leftPct}% + ${pad}px)`,
        width: `calc(${widthPct}% - ${pad * 2}px)`,
        top,
        height,
        borderRadius: 6,
        overflow: 'hidden',
        boxShadow: hover ? '0 2px 8px rgba(0,0,0,0.18)' : '0 1px 2px rgba(0,0,0,0.08)',
        border: '1px solid rgba(0,0,0,0.06)',
        background: `linear-gradient(180deg, ${lecture.color || 'var(--accent)'}22 0%, var(--bg-card) 38%)`,
        borderLeft: `3px solid ${lecture.color || 'var(--accent)'}`,
        zIndex: hover ? 4 : 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div className="week-event-actions" style={{ ...styles.evToolbar, opacity: hover ? 1 : 0 }}>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={(e) => { e.stopPropagation(); onEdit(lecture); }} title={t('lectures.editTitle')}>
          <EditIcon />
        </button>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={(e) => { e.stopPropagation(); onDelete(lecture.id); }} title={t('lectures.deleteTitleBtn')} style={{ color: 'var(--danger)' }}>
          <TrashIcon />
        </button>
      </div>
      <div style={styles.evBody}>
        <div style={styles.evTitle} title={lecture.name}>{lecture.name}</div>
        <div style={styles.evMeta}>
          <span style={{ color: lecture.color || 'var(--accent)', fontWeight: 600 }}>{timeStr}</span>
          {lecture.room && <span style={styles.evRoom} title={lecture.room}> · {lecture.room}</span>}
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 16px',
    background: 'var(--bg-tertiary)',
    borderBottom: '1px solid var(--border-color)',
  },
  toolbarBtns: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  weekTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    fontVariantNumeric: 'tabular-nums',
  },
  disclaimer: {
    margin: 0,
    padding: '8px 16px',
    fontSize: 11,
    lineHeight: 1.4,
    color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border-subtle)',
    background: 'var(--bg-secondary)',
  },
  scrollOuter: {
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
  },
  headerRow: {
    display: 'flex',
    minWidth: TIME_GUTTER_PX + 7 * MIN_DAY_COL_PX,
    borderBottom: '1px solid var(--border-color)',
    background: 'var(--bg-tertiary)',
  },
  cornerCell: {
    flexShrink: 0,
    borderRight: '1px solid var(--border-subtle)',
  },
  dayHeadCell: {
    flex: 1,
    padding: '10px 8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: 0,
  },
  dayHeadToday: {
    background: 'var(--accent-subtle)',
  },
  dayHeadShort: { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' },
  dayHeadNum: { fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' },
  dayHeadMonth: { fontSize: 11, color: 'var(--text-secondary)' },
  gridRow: {
    display: 'flex',
    minWidth: TIME_GUTTER_PX + 7 * MIN_DAY_COL_PX,
    background: 'var(--bg-secondary)',
  },
  timeGutter: {
    position: 'relative',
    flexShrink: 0,
    borderRight: '1px solid var(--border-color)',
    background: 'var(--bg-tertiary)',
    display: 'flex',
    flexDirection: 'column',
  },
  timeLabel: {
    position: 'absolute',
    right: 6,
    transform: 'translateY(-50%)',
    fontSize: 11,
    color: 'var(--text-muted)',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  dayColumnsWrap: {
    position: 'relative',
    flex: 1,
    display: 'flex',
    minWidth: 7 * MIN_DAY_COL_PX,
  },
  dayColumns: {
    display: 'flex',
    flex: 1,
    width: '100%',
  },
  dayColumn: {
    flex: 1,
    position: 'relative',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  allDayStrip: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '6px 6px 4px',
  },
  allDayChip: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    width: '100%',
    textAlign: 'left',
    padding: '4px 8px',
    borderRadius: 6,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-card)',
    fontSize: 11,
    color: 'var(--text-primary)',
    cursor: 'pointer',
    minHeight: 0,
  },
  allDayChipText: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: 500,
  },
  allDayChipBadge: {
    flexShrink: 0,
    fontSize: 9,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--text-muted)',
  },
  dayColumnGrid: {
    position: 'relative',
    flexShrink: 0,
  },
  dayColumnToday: {
    background: 'var(--accent-subtle)',
  },
  hourLines: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    background: 'var(--border-subtle)',
  },
  nowLineOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    pointerEvents: 'none',
    zIndex: 5,
    display: 'flex',
    alignItems: 'center',
  },
  nowLineBarFull: {
    width: '100%',
    height: 2,
    background: '#ef4444',
    opacity: 0.92,
    boxShadow: '0 0 0 1px rgba(255,255,255,0.15)',
  },
  evToolbar: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 0,
    padding: '2px 4px 0',
    flexShrink: 0,
    transition: 'opacity var(--transition)',
  },
  evBody: {
    padding: '0 8px 6px',
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    overflow: 'hidden',
  },
  evTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-primary)',
    lineHeight: 1.2,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
  evMeta: {
    fontSize: 10,
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  evRoom: {
    opacity: 0.9,
  },
};
