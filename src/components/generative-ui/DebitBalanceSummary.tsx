'use client';

import React from 'react';
import { formatCalendarDate } from '@/src/lib/date-utils';

interface DailyBalance {
  date: string;
  debitBalance: number;
}

interface DebitBalanceSummaryProps {
  accountCode: string;
  accountName: string;
  timePeriod: string;
  currentBalance: number;
  currentBalanceDate: string;
  average: number;
  highest: number;
  highestDate: string;
  lowest: number;
  lowestDate: string;
  dailyBalances: DailyBalance[];
}

// Terminal Luxe color palette - matching FeesSummary and AccountSummary
const colors = {
  bgCard: '#0a0a0f',
  bgCardVia: '#12121a',
  bgMetric: '#0d0d14',
  bgRow: '#0e0e16',
  bgRowAlt: '#12121c',
  border: '#2a2a35',
  borderLight: '#1f1f2a',
  borderHeader: '#1a1a25',
  textMuted: '#5a5a6e',
  textLabel: '#6b6b7e',
  textTitle: '#8b8b9e',
  textValue: '#e8e8ec',
  // Accent colors
  orange: '#ff9500',
  orangeLight: '#ffb340',
  gold: '#f0c674',
  green: '#50fa7b',
  red: '#ff5555',
  cyan: '#00d4ff',
  white: '#ffffff',
};

// Debit balance config
const debitConfig = {
  title: 'Debit Balance',
  description: 'Margin balance owed on account',
  icon: '💳',
  accentColor: colors.orange,
  gradientFrom: '#1a1208',
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
};

// Inline styles matching FeesSummary
const cardStyle: React.CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  borderRadius: '12px',
  background: `linear-gradient(to bottom right, ${colors.bgCard}, ${colors.bgCardVia}, ${colors.bgCard})`,
  border: `1px solid ${colors.border}`,
  boxShadow: '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)',
  fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 14px',
  borderBottom: `1px solid ${colors.borderHeader}`,
  background: `linear-gradient(to right, transparent, ${colors.bgCardVia}, transparent)`,
};

const titleStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 500,
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  color: colors.textTitle,
  margin: 0,
};

const periodBadgeStyle: React.CSSProperties = {
  fontSize: '10px',
  fontFamily: 'monospace',
  letterSpacing: '0.05em',
  color: colors.textMuted,
  padding: '3px 8px',
  borderRadius: '12px',
  backgroundColor: colors.borderHeader,
  border: `1px solid ${colors.border}`,
};

const labelStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  color: colors.textLabel,
};

const metricBoxStyle: React.CSSProperties = {
  position: 'relative',
  padding: '10px 12px',
  borderRadius: '8px',
  backgroundColor: colors.bgMetric,
  border: `1px solid ${colors.borderLight}`,
  transition: 'all 0.3s ease',
};

const metricValueStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '14px',
  fontWeight: 600,
  color: colors.white,
};

const heroValueStyle = (color: string): React.CSSProperties => ({
  fontFamily: 'monospace',
  fontSize: '28px',
  fontWeight: 700,
  letterSpacing: '-0.02em',
  background: `linear-gradient(90deg, ${color}, ${color}cc, ${color})`,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  margin: 0,
});

const dataRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 14px',
  borderBottom: `1px solid ${colors.borderHeader}`,
};

// Decorative background pattern
const BackgroundPattern = ({ accentColor }: { accentColor: string }) => (
  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity: 0.02,
        backgroundImage: `linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)`,
        backgroundSize: '20px 20px',
      }}
    />
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: '192px',
        height: '192px',
        opacity: 0.2,
        background: `radial-gradient(circle at center, ${accentColor}25 0%, transparent 70%)`,
      }}
    />
  </div>
);

// Icon badge component
const IconBadge = ({ icon, color }: { icon: string; color: string }) => (
  <div
    style={{
      width: '28px',
      height: '28px',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '14px',
      background: `linear-gradient(135deg, ${color}20 0%, ${color}10 100%)`,
      border: `1px solid ${color}30`,
      boxShadow: `0 0 12px ${color}15`,
    }}
  >
    {icon}
  </div>
);

// Data Row Component
const DataRow = ({
  label,
  value,
  valueColor = colors.textValue,
  isAlt = false,
  subLabel,
}: {
  label: string;
  value: string;
  valueColor?: string;
  isAlt?: boolean;
  subLabel?: string;
}) => (
  <div style={{
    ...dataRowStyle,
    background: isAlt ? colors.bgRowAlt : colors.bgRow,
  }}>
    <div>
      <span style={labelStyle}>{label}</span>
      {subLabel && (
        <span style={{
          fontSize: '9px',
          color: colors.textMuted,
          marginLeft: '6px',
          fontWeight: 400,
          letterSpacing: '0.05em',
        }}>
          {subLabel}
        </span>
      )}
    </div>
    <span style={{
      fontFamily: 'monospace',
      fontSize: '14px',
      fontWeight: 600,
      color: valueColor,
    }}>{value}</span>
  </div>
);

// Section Header Component
const SectionHeader = ({ title, color, rightText }: { title: string; color: string; rightText?: string }) => (
  <div style={{
    padding: '8px 14px',
    background: colors.bgCardVia,
    borderBottom: `1px solid ${colors.borderHeader}`,
    borderLeft: `3px solid ${color}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  }}>
    <span style={{
      fontSize: '10px',
      fontWeight: 600,
      letterSpacing: '0.15em',
      textTransform: 'uppercase',
      color: color,
    }}>{title}</span>
    {rightText && (
      <span style={{
        fontSize: '9px',
        color: colors.textMuted,
        fontFamily: 'monospace',
      }}>{rightText}</span>
    )}
  </div>
);

export default function DebitBalanceSummary({
  accountName,
  timePeriod,
  currentBalance,
  currentBalanceDate,
  average,
  highest,
  highestDate,
  lowest,
  lowestDate,
  dailyBalances,
}: DebitBalanceSummaryProps) {
  // Format date for display
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return formatCalendarDate(dateStr);
  };

  return (
    <div style={cardStyle} data-testid="debit-balance-summary-card">
      <BackgroundPattern accentColor={debitConfig.accentColor} />

      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <IconBadge icon={debitConfig.icon} color={debitConfig.accentColor} />
          <div>
            <h3 style={titleStyle}>{debitConfig.title}</h3>
            <p style={{ fontSize: '10px', color: colors.textMuted, margin: '2px 0 0 0' }}>
              {accountName}
            </p>
          </div>
        </div>
        <span style={periodBadgeStyle}>{timePeriod}</span>
      </div>

      {/* Main content */}
      <div style={{ position: 'relative' }}>
        {/* Hero - Current Balance */}
        <div
          style={{
            ...metricBoxStyle,
            margin: '12px 14px',
            textAlign: 'center',
            padding: '16px 12px',
            background: `linear-gradient(135deg, ${debitConfig.gradientFrom} 0%, ${colors.bgMetric} 100%)`,
            borderTop: `2px solid ${debitConfig.accentColor}`,
          }}
        >
          <span style={labelStyle}>
            Current Balance
          </span>
          <span style={{
            fontSize: '10px',
            color: colors.textMuted,
            marginLeft: '6px',
            fontWeight: 400,
          }}>
            {formatDate(currentBalanceDate)}
          </span>
          <p style={{ ...heroValueStyle(debitConfig.accentColor), marginTop: '8px' }}>
            {formatCurrency(currentBalance)}
          </p>
        </div>

        {/* Stats Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          padding: '0 14px 12px',
        }}>
          {/* Average */}
          <div style={metricBoxStyle}>
            <span style={labelStyle}>Average</span>
            <p style={{ ...metricValueStyle, marginTop: '6px', color: colors.cyan }}>
              {formatCurrency(average)}
            </p>
          </div>

          {/* Highest */}
          <div style={metricBoxStyle}>
            <span style={labelStyle}>Highest</span>
            <p style={{ ...metricValueStyle, marginTop: '6px', color: colors.red }}>
              {formatCurrency(highest)}
            </p>
            <p style={{ fontSize: '9px', color: colors.textMuted, marginTop: '2px' }}>
              {formatDate(highestDate)}
            </p>
          </div>

          {/* Lowest */}
          <div style={metricBoxStyle}>
            <span style={labelStyle}>Lowest</span>
            <p style={{ ...metricValueStyle, marginTop: '6px', color: colors.green }}>
              {formatCurrency(lowest)}
            </p>
            <p style={{ fontSize: '9px', color: colors.textMuted, marginTop: '2px' }}>
              {formatDate(lowestDate)}
            </p>
          </div>
        </div>

        {/* Daily Breakdown Section */}
        {dailyBalances && dailyBalances.length > 0 && (
          <>
            <SectionHeader
              title="Daily Balances"
              color={debitConfig.accentColor}
              rightText={`${dailyBalances.length} days`}
            />
            <div style={{ maxHeight: '140px', overflowY: 'auto' }}>
              {dailyBalances.slice(-5).map((day, idx) => {
                const isHighest = day.debitBalance === highest;
                const isLowest = day.debitBalance === lowest;
                const valueColor = isHighest ? colors.red : isLowest ? colors.green : colors.textValue;

                return (
                  <DataRow
                    key={day.date}
                    label={formatDate(day.date)}
                    value={`${formatCurrency(day.debitBalance)}${isHighest ? ' ▲' : isLowest ? ' ▼' : ''}`}
                    valueColor={valueColor}
                    isAlt={idx % 2 === 1}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
