'use client';

import React from 'react';

export type SecurityFilterType = 'all' | 'stock' | 'option';
export type PositionFilterType = 'all' | 'long' | 'short' | 'flat';

export interface Position {
  symbol: string;
  securityType: 'stock' | 'option';
  qty: number;
  closePrice: number;
  marketValue: number;
  underlyingSymbol?: string;
  expiration?: string;
  strike?: number;
  callPut?: 'C' | 'P';
}

export interface PositionsProps {
  securityType: SecurityFilterType;
  positionType: PositionFilterType;
  symbol?: string;
  expiration?: string;
  positions: Position[];
  summary: {
    totalPositions: number;
    totalLong: number;
    totalShort: number;
    totalFlat: number;
    totalMarketValue: number;
    longMarketValue: number;
    shortMarketValue: number;
  };
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
  cyan: '#66d9ef',
  white: '#ffffff',
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
};

const formatNumber = (value: number) => {
  return new Intl.NumberFormat('en-US').format(value);
};

const formatExpiration = (expDate: string) => {
  const date = new Date(expDate);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Card configuration
const cardConfig: Record<SecurityFilterType, {
  title: string;
  description: string;
  icon: string;
  accentColor: string;
  gradientFrom: string;
}> = {
  all: {
    title: 'All Positions',
    description: 'Stocks and options holdings',
    icon: '\ud83d\udcca',
    accentColor: colors.blue,
    gradientFrom: '#0f151a',
  },
  stock: {
    title: 'Stock Positions',
    description: 'Equity holdings',
    icon: '\ud83d\udcc8',
    accentColor: colors.green,
    gradientFrom: '#0f1a15',
  },
  option: {
    title: 'Option Positions',
    description: 'Derivatives holdings',
    icon: '\ud83c\udfaf',
    accentColor: colors.purple,
    gradientFrom: '#150f1a',
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

const badgeStyle: React.CSSProperties = {
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

// Position type badge
const PositionTypeBadge = ({ qty }: { qty: number }) => {
  const isLong = qty > 0;
  const isShort = qty < 0;
  const color = isLong ? colors.green : isShort ? colors.red : colors.textMuted;
  const label = isLong ? 'LONG' : isShort ? 'SHORT' : 'FLAT';

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 6px',
        borderRadius: '4px',
        background: `${color}15`,
        border: `1px solid ${color}30`,
      }}
    >
      <span style={{ fontSize: '9px', fontWeight: 600, color, letterSpacing: '0.05em' }}>{label}</span>
    </div>
  );
};

// Option badge
const OptionBadge = ({ callPut }: { callPut: 'C' | 'P' }) => {
  const isCall = callPut === 'C';
  const color = isCall ? colors.blue : colors.purple;
  const label = isCall ? 'CALL' : 'PUT';

  return (
    <span
      style={{
        fontSize: '9px',
        fontWeight: 600,
        color,
        padding: '2px 5px',
        borderRadius: '3px',
        background: `${color}20`,
        letterSpacing: '0.05em',
      }}
    >
      {label}
    </span>
  );
};

export function PositionsCard({
  securityType,
  positionType,
  symbol,
  positions,
  summary,
}: PositionsProps) {
  const config = cardConfig[securityType];
  const hasNoData = positions.length === 0;

  // Separate stocks and options
  const stockPositions = positions.filter(p => p.securityType === 'stock');
  const optionPositions = positions.filter(p => p.securityType === 'option');

  // Get title based on query type
  let displayTitle = config.title;
  let displayDescription = config.description;

  if (symbol) {
    displayTitle = `${symbol.toUpperCase()} Positions`;
    displayDescription = `Holdings for ${symbol.toUpperCase()}`;
  } else if (positionType === 'short') {
    displayTitle = 'Short Positions';
    displayDescription = 'Short stock holdings';
  } else if (positionType === 'long') {
    displayTitle = 'Long Positions';
    displayDescription = 'Long stock holdings';
  }

  return (
    <div style={cardStyle} data-testid="positions-card" data-security-type={securityType}>
      <BackgroundPattern accentColor={config.accentColor} />

      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <IconBadge icon={config.icon} color={config.accentColor} />
          <div>
            <h3 style={titleStyle}>{displayTitle}</h3>
            <p style={{ fontSize: '10px', color: colors.textMuted, margin: '2px 0 0 0' }}>{displayDescription}</p>
          </div>
        </div>
        <span style={badgeStyle}>{summary.totalPositions} positions</span>
      </div>

      {/* Main content */}
      <div style={{ position: 'relative', padding: '12px 14px' }}>
        {hasNoData ? (
          <div
            style={{
              ...metricBoxStyle,
              textAlign: 'center',
              padding: '14px',
              background: `linear-gradient(135deg, ${config.gradientFrom} 0%, ${colors.bgMetric} 100%)`,
            }}
          >
            <span style={{ ...labelStyle, color: colors.textMuted }}>
              No {positionType !== 'all' ? positionType + ' ' : ''}{securityType !== 'all' ? securityType + ' ' : ''}positions found
              {symbol ? ` for ${symbol.toUpperCase()}` : ''}
            </span>
          </div>
        ) : (
          <>
            {/* Summary metrics */}
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
              <span style={labelStyle}>Total Market Value</span>
              <p style={{ ...heroValueStyle(summary.totalMarketValue >= 0 ? colors.green : colors.red), marginTop: '6px' }}>
                {formatCurrency(Math.abs(summary.totalMarketValue))}
              </p>
            </div>

            {/* Position breakdown */}
            {securityType === 'all' || (!symbol && positionType === 'all') ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '10px' }}>
                <div style={{ ...metricBoxStyle, borderLeft: `3px solid ${colors.green}` }}>
                  <span style={labelStyle}>Long</span>
                  <p style={{ ...metricValueStyle, marginTop: '4px', color: colors.green }}>
                    {summary.totalLong}
                  </p>
                </div>
                <div style={{ ...metricBoxStyle, borderLeft: `3px solid ${colors.red}` }}>
                  <span style={labelStyle}>Short</span>
                  <p style={{ ...metricValueStyle, marginTop: '4px', color: colors.red }}>
                    {summary.totalShort}
                  </p>
                </div>
                <div style={{ ...metricBoxStyle, borderLeft: `3px solid ${colors.textMuted}` }}>
                  <span style={labelStyle}>Flat</span>
                  <p style={{ ...metricValueStyle, marginTop: '4px', color: colors.textMuted }}>
                    {summary.totalFlat}
                  </p>
                </div>
              </div>
            ) : null}

            {/* Stock positions list */}
            {stockPositions.length > 0 && (
              <div style={{ borderTop: `1px solid ${colors.borderHeader}`, paddingTop: '8px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={labelStyle}>Stock Positions</span>
                  <span style={{ fontSize: '9px', color: colors.textMuted }}>
                    {stockPositions.length} position{stockPositions.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
                  {stockPositions.filter(p => p.qty !== 0).map((position, index) => (
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
                        <PositionTypeBadge qty={position.qty} />
                        <div>
                          <span style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 600, color: colors.white }}>
                            {position.symbol}
                          </span>
                          <span style={{ fontSize: '10px', color: colors.textMuted, marginLeft: '8px' }}>
                            {formatNumber(Math.abs(position.qty))} shares
                          </span>
                        </div>
                      </div>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: position.qty > 0 ? colors.green : colors.red,
                        }}
                      >
                        {formatCurrency(Math.abs(position.marketValue))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Option positions list */}
            {optionPositions.length > 0 && (
              <div style={{ borderTop: `1px solid ${colors.borderHeader}`, paddingTop: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={labelStyle}>Option Positions</span>
                  <span style={{ fontSize: '9px', color: colors.textMuted }}>
                    {optionPositions.length} position{optionPositions.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '150px', overflowY: 'auto' }}>
                  {optionPositions.map((position, index) => (
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <PositionTypeBadge qty={position.qty} />
                        {position.callPut && <OptionBadge callPut={position.callPut} />}
                        <div>
                          <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 600, color: colors.white }}>
                            {position.underlyingSymbol || position.symbol}
                          </span>
                          <span style={{ fontSize: '10px', color: colors.textMuted, marginLeft: '6px' }}>
                            {position.expiration && formatExpiration(position.expiration)} ${position.strike}
                          </span>
                          <span style={{ fontSize: '10px', color: colors.textMuted, marginLeft: '6px' }}>
                            {formatNumber(Math.abs(position.qty))} contracts
                          </span>
                        </div>
                      </div>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: colors.cyan,
                        }}
                      >
                        {formatCurrency(position.marketValue)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
