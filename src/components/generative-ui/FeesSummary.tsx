'use client';

import React from 'react';
import { formatCalendarDate } from '@/src/lib/date-utils';

export type FeeType = 'commission' | 'credit_interest' | 'debit_interest' | 'locate_fee';

export interface FeesSummaryProps {
  feeType: FeeType;
  totalAmount: number;
  transactionCount: number;
  timePeriod: string;
  symbol?: string;
  breakdown?: Array<{
    date: string;
    amount: number;
    symbol?: string;
  }>;
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

// Fee type configuration
const feeConfig: Record<FeeType, {
  title: string;
  description: string;
  icon: string;
  accentColor: string;
  gradientFrom: string;
  isCredit: boolean;
}> = {
  commission: {
    title: 'Trading Commissions',
    description: 'Total fees paid on executed trades',
    icon: '📊',
    accentColor: colors.gold,
    gradientFrom: '#1a1510',
    isCredit: false,
  },
  credit_interest: {
    title: 'Credit Interest',
    description: 'Interest earned on credit balance',
    icon: '💰',
    accentColor: colors.green,
    gradientFrom: '#0f1a0f',
    isCredit: true,
  },
  debit_interest: {
    title: 'Debit Interest',
    description: 'Interest paid on margin balance',
    icon: '📉',
    accentColor: colors.red,
    gradientFrom: '#1a0f0f',
    isCredit: false,
  },
  locate_fee: {
    title: 'Locate Fees',
    description: 'Fees for borrowing shares to short',
    icon: '🔍',
    accentColor: colors.purple,
    gradientFrom: '#150f1a',
    isCredit: false,
  },
};

// Inline styles
const cardStyle: React.CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  borderRadius: '16px',
  background: `linear-gradient(to bottom right, ${colors.bgCard}, ${colors.bgCardVia}, ${colors.bgCard})`,
  border: `1px solid ${colors.border}`,
  boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px',
  borderBottom: `1px solid ${colors.borderHeader}`,
  background: `linear-gradient(to right, transparent, ${colors.bgCardVia}, transparent)`,
};

const titleStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 500,
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  color: colors.textTitle,
  margin: 0,
};

const periodBadgeStyle: React.CSSProperties = {
  fontSize: '12px',
  fontFamily: 'monospace',
  letterSpacing: '0.05em',
  color: colors.textMuted,
  padding: '4px 12px',
  borderRadius: '20px',
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
  padding: '16px',
  borderRadius: '12px',
  backgroundColor: colors.bgMetric,
  border: `1px solid ${colors.borderLight}`,
  transition: 'all 0.3s ease',
};

const metricValueStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '20px',
  fontWeight: 600,
  color: colors.white,
};

const heroValueStyle = (color: string): React.CSSProperties => ({
  fontFamily: 'monospace',
  fontSize: '36px',
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
      width: '40px',
      height: '40px',
      borderRadius: '12px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '18px',
      background: `linear-gradient(135deg, ${color}20 0%, ${color}10 100%)`,
      border: `1px solid ${color}30`,
      boxShadow: `0 0 20px ${color}15`,
    }}
  >
    {icon}
  </div>
);

export function FeesSummary({ feeType, totalAmount, transactionCount, timePeriod, symbol, breakdown }: FeesSummaryProps) {
  const config = feeConfig[feeType];
  const averageAmount = transactionCount > 0 ? totalAmount / transactionCount : 0;
  const displayTitle = feeType === 'locate_fee' && symbol ? `Locate Fees — ${symbol}` : config.title;

  return (
    <div style={cardStyle}>
      <BackgroundPattern accentColor={config.accentColor} />

      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <IconBadge icon={config.icon} color={config.accentColor} />
          <div>
            <h3 style={titleStyle}>{displayTitle}</h3>
            <p style={{ fontSize: '12px', color: colors.textMuted, margin: '4px 0 0 0' }}>{config.description}</p>
          </div>
        </div>
        <span style={periodBadgeStyle}>{timePeriod}</span>
      </div>

      {/* Main content */}
      <div style={{ position: 'relative', padding: '24px' }}>
        {/* Hero amount */}
        <div
          style={{
            ...metricBoxStyle,
            marginBottom: '24px',
            textAlign: 'center',
            padding: '24px',
            background: `linear-gradient(135deg, ${config.gradientFrom} 0%, ${colors.bgMetric} 100%)`,
            borderTop: `2px solid ${config.accentColor}`,
          }}
        >
          <span style={labelStyle}>
            {config.isCredit ? 'Total Earned' : 'Total Paid'}
          </span>
          <p style={{ ...heroValueStyle(config.accentColor), marginTop: '12px' }}>
            {formatCurrency(Math.abs(totalAmount))}
          </p>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <div style={metricBoxStyle}>
            <span style={labelStyle}>Transactions</span>
            <p style={{ ...metricValueStyle, marginTop: '8px' }}>
              {transactionCount.toLocaleString()}
            </p>
          </div>
          <div style={metricBoxStyle}>
            <span style={labelStyle}>Average per Transaction</span>
            <p style={{ ...metricValueStyle, marginTop: '8px' }}>
              {formatCurrency(Math.abs(averageAmount))}
            </p>
          </div>
        </div>

        {/* Breakdown section */}
        {breakdown && breakdown.length > 0 && (
          <div style={{ borderTop: `1px solid ${colors.borderHeader}`, paddingTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span style={labelStyle}>Recent Activity</span>
              <span style={{ fontSize: '10px', color: colors.textMuted }}>
                Showing {Math.min(5, breakdown.length)} of {breakdown.length}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '144px', overflowY: 'auto' }}>
              {breakdown.slice(0, 5).map((item, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: colors.bgMetric,
                    border: `1px solid ${colors.borderHeader}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '12px', fontFamily: 'monospace', color: colors.textLabel }}>
                      {formatCalendarDate(item.date)}
                    </span>
                    {item.symbol && (
                      <span
                        style={{
                          fontSize: '12px',
                          fontFamily: 'monospace',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: `${config.accentColor}15`,
                          color: config.accentColor,
                          border: `1px solid ${config.accentColor}30`,
                        }}
                      >
                        {item.symbol}
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: config.accentColor,
                    }}
                  >
                    {formatCurrency(Math.abs(item.amount))}
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
