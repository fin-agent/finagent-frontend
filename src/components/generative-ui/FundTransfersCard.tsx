'use client';

import React from 'react';
import { formatCalendarDate } from '@/src/lib/date-utils';

export type TransferType = 'all' | 'wire' | 'ach' | 'journal';
export type DirectionType = 'all' | 'in' | 'out';

export interface FundTransfersProps {
  transferType: TransferType;
  direction: DirectionType;
  totalAmount?: number; // Optional - heroAmount is calculated from totalIn/totalOut based on direction
  transactionCount: number;
  timePeriod: string;
  totalIn: number;
  totalOut: number;
  countIn: number;
  countOut: number;
  transfers?: Array<{
    date: string;
    type: string;
    direction: 'in' | 'out';
    amount: number;
    transNumber: string;
  }>;
  suggestion?: {
    period: string;
    amount: number;
    count: number;
    startDate: string;
    endDate: string;
  } | null;
}

// Colors for the premium theme
const colors = {
  bgCard: '#0a0a0f',
  bgCardVia: '#12121a',
  bgMetric: '#0d0d14',
  bgMetricHover: '#0f0f18',
  border: '#2a2a35',
  borderLight: '#1f1f2a',
  borderHeader: '#1a1a25',
  textMuted: '#5a5a6e',
  textLabel: '#6b6b7e',
  textTitle: '#8b8b9e',
  gold: '#f0c674',
  green: '#50fa7b',
  red: '#ff5555',
  blue: '#8be9fd',
  purple: '#bd93f9',
  white: '#ffffff',
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
};

// Transfer type configuration
const transferConfig: Record<TransferType, {
  title: string;
  description: string;
  icon: string;
  accentColor: string;
  gradientFrom: string;
}> = {
  all: {
    title: 'Fund Transfers',
    description: 'Account deposits and withdrawals',
    icon: '💸',
    accentColor: colors.blue,
    gradientFrom: '#0f151a',
  },
  wire: {
    title: 'Wire Transfers',
    description: 'Bank wire transactions',
    icon: '🏦',
    accentColor: colors.purple,
    gradientFrom: '#150f1a',
  },
  ach: {
    title: 'ACH Transfers',
    description: 'Automated clearing house transfers',
    icon: '🔄',
    accentColor: colors.gold,
    gradientFrom: '#1a1510',
  },
  journal: {
    title: 'Journal Entries',
    description: 'Internal account adjustments',
    icon: '📝',
    accentColor: colors.textMuted,
    gradientFrom: '#101015',
  },
};

// Inline styles
const cardStyle: React.CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  borderRadius: '12px',
  background: `linear-gradient(to bottom right, ${colors.bgCard}, ${colors.bgCardVia}, ${colors.bgCard})`,
  border: `1px solid ${colors.border}`,
  boxShadow: '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)',
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
  fontSize: '20px',
  fontWeight: 700,
  letterSpacing: '-0.02em',
  background: `linear-gradient(90deg, ${color}, ${color}cc, ${color})`,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  margin: 0,
});

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

// Direction badge component
const DirectionBadge = ({ direction }: { direction: 'in' | 'out' }) => {
  const isIn = direction === 'in';
  const color = isIn ? colors.green : colors.red;
  const arrow = isIn ? '↓' : '↑';
  const label = isIn ? 'IN' : 'OUT';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 6px',
        borderRadius: '4px',
        background: `${color}15`,
        border: `1px solid ${color}30`,
      }}
    >
      <span style={{ fontSize: '10px', color }}>{arrow}</span>
      <span style={{ fontSize: '9px', fontWeight: 600, color, letterSpacing: '0.05em' }}>{label}</span>
    </div>
  );
};

export function FundTransfersCard({
  transferType,
  direction,
  transactionCount,
  timePeriod,
  totalIn,
  totalOut,
  countIn,
  countOut,
  transfers,
  suggestion,
}: FundTransfersProps) {
  const config = transferConfig[transferType];
  const netAmount = totalIn - totalOut;
  const hasNoData = transactionCount === 0;

  // Determine what to show in hero section based on direction filter
  const heroLabel = direction === 'in' ? 'Total Deposited' : direction === 'out' ? 'Total Withdrawn' : 'Net Movement';
  const heroAmount = direction === 'in' ? totalIn : direction === 'out' ? totalOut : netAmount;
  const heroColor = direction === 'out' ? colors.red : netAmount >= 0 ? colors.green : colors.red;

  return (
    <div style={cardStyle} data-testid="fund-transfers-card" data-transfer-type={transferType}>
      <BackgroundPattern accentColor={config.accentColor} />

      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <IconBadge icon={config.icon} color={config.accentColor} />
          <div>
            <h3 style={titleStyle}>{config.title}</h3>
            <p style={{ fontSize: '10px', color: colors.textMuted, margin: '2px 0 0 0' }}>{config.description}</p>
          </div>
        </div>
        <span style={periodBadgeStyle} data-testid="transfers-card-period">{timePeriod}</span>
      </div>

      {/* Main content */}
      <div style={{ position: 'relative', padding: '12px 14px' }}>
        {/* Hero amount or Suggestion */}
        {hasNoData && suggestion ? (
          <div
            style={{
              ...metricBoxStyle,
              marginBottom: '10px',
              textAlign: 'center',
              padding: '14px',
              background: `linear-gradient(135deg, ${config.gradientFrom} 0%, ${colors.bgMetric} 100%)`,
              borderTop: `2px solid ${colors.gold}`,
            }}
          >
            <span style={{ ...labelStyle, color: colors.textMuted }}>
              No transfers for {timePeriod}
            </span>
            <p style={{ fontSize: '12px', color: colors.textLabel, margin: '8px 0' }}>
              However, I found data for <span style={{ color: colors.gold, fontWeight: 600 }}>{suggestion.period}</span>
            </p>
            <p style={{ ...heroValueStyle(colors.green), marginTop: '6px' }}>
              {formatCurrency(Math.abs(suggestion.amount))}
            </p>
            <p style={{ fontSize: '10px', color: colors.textMuted, marginTop: '6px' }}>
              {suggestion.count} transfers available
            </p>
          </div>
        ) : hasNoData ? (
          <div
            style={{
              ...metricBoxStyle,
              marginBottom: '10px',
              textAlign: 'center',
              padding: '14px',
              background: `linear-gradient(135deg, ${config.gradientFrom} 0%, ${colors.bgMetric} 100%)`,
            }}
          >
            <span style={{ ...labelStyle, color: colors.textMuted }}>
              No transfers found for {timePeriod}
            </span>
          </div>
        ) : (
          <>
            {/* Hero metric */}
            <div
              style={{
                ...metricBoxStyle,
                marginBottom: '10px',
                textAlign: 'center',
                padding: '12px',
                background: `linear-gradient(135deg, ${config.gradientFrom} 0%, ${colors.bgMetric} 100%)`,
                borderTop: `2px solid ${config.accentColor}`,
              }}
            >
              <span style={labelStyle}>{heroLabel}</span>
              <p style={{ ...heroValueStyle(heroColor), marginTop: '6px' }}>
                {heroAmount < 0 ? '-' : ''}{formatCurrency(Math.abs(heroAmount))}
              </p>
            </div>

            {/* In/Out breakdown - only show for 'all' direction */}
            {direction === 'all' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '10px' }}>
                <div style={{ ...metricBoxStyle, borderLeft: `3px solid ${colors.green}` }}>
                  <span style={labelStyle}>Deposits</span>
                  <p style={{ ...metricValueStyle, marginTop: '4px', color: colors.green }}>
                    {formatCurrency(totalIn)}
                  </p>
                  <span style={{ fontSize: '10px', color: colors.textMuted }}>{countIn} transfers</span>
                </div>
                <div style={{ ...metricBoxStyle, borderLeft: `3px solid ${colors.red}` }}>
                  <span style={labelStyle}>Withdrawals</span>
                  <p style={{ ...metricValueStyle, marginTop: '4px', color: colors.red }}>
                    {formatCurrency(totalOut)}
                  </p>
                  <span style={{ fontSize: '10px', color: colors.textMuted }}>{countOut} transfers</span>
                </div>
              </div>
            )}

            {/* Single direction summary - show count for in/out filters */}
            {direction !== 'all' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '10px' }}>
                <div style={metricBoxStyle}>
                  <span style={labelStyle}>Transfers</span>
                  <p style={{ ...metricValueStyle, marginTop: '4px' }}>
                    {direction === 'in' ? countIn : countOut}
                  </p>
                </div>
                <div style={metricBoxStyle}>
                  <span style={labelStyle}>Average</span>
                  <p style={{ ...metricValueStyle, marginTop: '4px' }}>
                    {formatCurrency(heroAmount / (direction === 'in' ? countIn : countOut) || 0)}
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Transfers list */}
        {transfers && transfers.length > 0 && (
          <div style={{ borderTop: `1px solid ${colors.borderHeader}`, paddingTop: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={labelStyle}>Recent Transfers</span>
              <span style={{ fontSize: '9px', color: colors.textMuted }}>
                {Math.min(5, transfers.length)} of {transfers.length}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '150px', overflowY: 'auto' }}>
              {transfers.slice(0, 5).map((transfer, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: colors.bgMetric,
                    border: `1px solid ${colors.borderHeader}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <DirectionBadge direction={transfer.direction} />
                    <div>
                      <span style={{ fontSize: '11px', fontFamily: 'monospace', color: colors.white }}>
                        {transfer.type}
                      </span>
                      <span style={{ fontSize: '10px', color: colors.textMuted, marginLeft: '8px' }}>
                        {formatCalendarDate(transfer.date)}
                      </span>
                    </div>
                  </div>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: transfer.direction === 'in' ? colors.green : colors.red,
                    }}
                  >
                    {transfer.direction === 'in' ? '+' : '-'}{formatCurrency(transfer.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
