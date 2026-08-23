import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie
} from 'recharts';
import { useLocale } from '../../context/LocaleContext';

export default function GradeAnalytics({ exams, targetGpa, targetEcts }) {
  const { t, intlLocale } = useLocale();

  // ECTS Progress
  const completedEcts = exams
    .filter(e => e.grade != null && e.passed)
    .reduce((sum, e) => sum + (e.credits || 0), 0);
  
  const ectsData = [
    { name: t('gradeAnalytics.completed'), value: completedEcts, fill: 'var(--accent)' },
    { name: t('gradeAnalytics.remaining'), value: Math.max(0, targetEcts - completedEcts), fill: 'var(--bg-tertiary)' }
  ];

  // GPA Timeline
  const timelineData = exams
    .filter(e => e.grade != null && e.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({
      name: new Date(e.date).toLocaleDateString(intlLocale, { month: 'short', year: '2y' }),
      grade: parseFloat(e.grade),
      subject: e.name
    }));

  // What-If Calculation
  const remainingEcts = Math.max(0, targetEcts - completedEcts);
  const currentWeightedSum = exams
    .filter(e => e.grade != null)
    .reduce((sum, e) => sum + (parseFloat(e.grade) * (e.credits || 0)), 0);
  
  // (currentWeightedSum + requiredGrade * remainingEcts) / targetEcts = targetGpa
  // requiredGrade = (targetGpa * targetEcts - currentWeightedSum) / remainingEcts
  const requiredGrade = remainingEcts > 0 
    ? (targetGpa * targetEcts - currentWeightedSum) / remainingEcts 
    : null;

  return (
    <div className="grade-analytics" style={styles.container}>
      <div className="grid-3 grade-analytics-grid" style={{ gap: 20 }}>
        {/* ECTS Fortschritt */}
        <div className="card" style={styles.card}>
          <div style={styles.cardTitle}>{t('gradeAnalytics.ectsProgress')}</div>
          <div style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={ectsData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {ectsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div style={styles.pieLabel}>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{completedEcts}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('gradeAnalytics.ofTarget', { target: targetEcts })}</div>
            </div>
          </div>
        </div>

        {/* Notenverlauf */}
        <div className="card grade-timeline" style={{ ...styles.card, gridColumn: 'span 2' }}>
          <div style={styles.cardTitle}>{t('gradeAnalytics.timeline')}</div>
          <div style={{ height: 160 }}>
            {timelineData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    stroke="var(--text-muted)" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    reversed 
                    domain={[1.0, 4.0]} 
                    ticks={[1.0, 2.0, 3.0, 4.0]} 
                    stroke="var(--text-muted)" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <Tooltip 
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8 }}
                    itemStyle={{ color: 'var(--accent)' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="grade" 
                    stroke="var(--accent)" 
                    strokeWidth={3} 
                    dot={{ r: 4, fill: 'var(--accent)' }} 
                    activeDot={{ r: 6 }} 
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={styles.emptyState}>{t('gradeAnalytics.notEnoughData')}</div>
            )}
          </div>
        </div>
      </div>

      {/* What-If Banner */}
      <div className="card" style={styles.whatIf}>
        <div className="grade-what-if" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>📈</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{t('gradeAnalytics.targetAnalysis')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {t('gradeAnalytics.targetBody', { target: targetGpa.toFixed(1), remaining: remainingEcts })}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ 
            padding: '8px 16px', 
            borderRadius: 12, 
            background: 'var(--accent-subtle)', 
            color: 'var(--accent-hover)',
            fontSize: 20,
            fontWeight: 800
          }}>
            {requiredGrade === null ? '—' : requiredGrade < 1.0 ? t('gradeAnalytics.betterThanOne') : requiredGrade > 4.0 ? t('gradeAnalytics.impossible') : requiredGrade.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { marginBottom: 32 },
  card: { padding: 20, position: 'relative' },
  cardTitle: { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 },
  pieLabel: { 
    position: 'absolute', 
    top: '58%', 
    left: '50%', 
    transform: 'translate(-50%, -50%)', 
    textAlign: 'center',
    pointerEvents: 'none'
  },
  emptyState: { height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 },
  whatIf: { marginTop: 20, borderLeft: '4px solid var(--accent)', padding: '16px 20px' }
};
