'use client';

import React from 'react';

export interface StockQuoteProps {
  symbol: string;
  companyName?: string;
  price: number;
  change: number;
  changePercent: number;
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  mid: number;
  spread: number;
  spreadPercent: number;
  volume: number;
  dayHigh: number;
  dayLow: number;
  dayOpen: number;
  prevClose: number;
  timestamp: string;
  isMarketOpen: boolean;
}

// Terminal Luxe color palette
const colors = {
  bgCard: '#0a0a0f',
  bgCardVia: '#12121a',
  bgMetric: '#0d0d14',
  border: '#2a2a35',
  borderLight: '#1f1f2a',
  borderHeader: '#1a1a25',
  textMuted: '#5a5a6e',
  textLabel: '#6b6b7e',
  textTitle: '#8b8b9e',
  gold: '#f0c674',
  green: '#50fa7b',
  red: '#ff5555',
  cyan: '#8be9fd',
  purple: '#bd93f9',
  white: '#ffffff',
};

const formatCurrency = (value: number, decimals: number = 2) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

const formatNumber = (value: number) => {
  if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B';
  if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M';
  if (value >= 1e3) return (value / 1e3).toFixed(2) + 'K';
  return value.toLocaleString();
};

const formatTime = (timestamp: string) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
};

// Styles
const cardStyle: React.CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  borderRadius: '12px',
  background: `linear-gradient(to bottom right, ${colors.bgCard}, ${colors.bgCardVia}, ${colors.bgCard})`,
  border: `1px solid ${colors.border}`,
  boxShadow: '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)',
  maxWidth: '400px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: `1px solid ${colors.borderHeader}`,
  background: `linear-gradient(to right, transparent, ${colors.bgCardVia}, transparent)`,
};

const symbolStyle: React.CSSProperties = {
  fontSize: '18px',
  fontWeight: 700,
  color: colors.white,
  margin: 0,
  letterSpacing: '0.05em',
};

const statusBadgeStyle = (isOpen: boolean): React.CSSProperties => ({
  fontSize: '9px',
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: isOpen ? colors.green : colors.textMuted,
  padding: '4px 8px',
  borderRadius: '12px',
  backgroundColor: isOpen ? 'rgba(80, 250, 123, 0.1)' : colors.borderHeader,
  border: `1px solid ${isOpen ? 'rgba(80, 250, 123, 0.3)' : colors.border}`,
});

const priceBlockStyle: React.CSSProperties = {
  padding: '16px',
  textAlign: 'center',
  borderBottom: `1px solid ${colors.borderLight}`,
};

const priceStyle: React.CSSProperties = {
  fontSize: '36px',
  fontWeight: 700,
  color: colors.white,
  margin: 0,
  fontFamily: 'monospace',
  letterSpacing: '-0.02em',
};

const changeStyle = (isPositive: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '14px',
  fontWeight: 600,
  color: isPositive ? colors.green : colors.red,
  marginTop: '8px',
});

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '1px',
  backgroundColor: colors.borderLight,
};

const metricCellStyle: React.CSSProperties = {
  padding: '12px 16px',
  backgroundColor: colors.bgMetric,
};

const labelStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: colors.textLabel,
  marginBottom: '4px',
};

const valueStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: colors.white,
  fontFamily: 'monospace',
};

const bidAskRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 16px',
  borderBottom: `1px solid ${colors.borderLight}`,
  backgroundColor: colors.bgMetric,
};

const bidAskContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

const bidAskLabelStyle: React.CSSProperties = {
  fontSize: '9px',
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: colors.textLabel,
  marginBottom: '2px',
};

const bidStyle: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 700,
  color: colors.green,
  fontFamily: 'monospace',
};

const askStyle: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 700,
  color: colors.red,
  fontFamily: 'monospace',
};

const spreadContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '0 12px',
};

const spreadStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: colors.gold,
  fontFamily: 'monospace',
};

const sizeStyle: React.CSSProperties = {
  fontSize: '10px',
  color: colors.textMuted,
  fontFamily: 'monospace',
  marginTop: '2px',
};

const footerStyle: React.CSSProperties = {
  padding: '8px 16px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  backgroundColor: colors.bgCard,
};

const timestampStyle: React.CSSProperties = {
  fontSize: '10px',
  color: colors.textMuted,
  fontFamily: 'monospace',
};

export function StockQuoteCard({
  symbol,
  companyName,
  price,
  change,
  changePercent,
  bid,
  bidSize,
  ask,
  askSize,
  mid,
  spread,
  spreadPercent,
  volume,
  dayHigh,
  dayLow,
  dayOpen,
  prevClose,
  timestamp,
  isMarketOpen,
}: StockQuoteProps) {
  const isPositive = change >= 0;
  const arrow = isPositive ? '\u25B2' : '\u25BC';

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <h3 style={symbolStyle}>{symbol}</h3>
          {companyName && (
            <div style={{ fontSize: '11px', color: colors.textMuted, marginTop: '2px' }}>
              {companyName}
            </div>
          )}
        </div>
        <span style={statusBadgeStyle(isMarketOpen)}>
          {isMarketOpen ? 'Market Open' : 'Market Closed'}
        </span>
      </div>

      {/* Price Block */}
      <div style={priceBlockStyle}>
        <div style={priceStyle}>{formatCurrency(price)}</div>
        <div style={changeStyle(isPositive)}>
          <span>{arrow}</span>
          <span>{formatCurrency(Math.abs(change))}</span>
          <span style={{ color: colors.textMuted }}>|</span>
          <span>{isPositive ? '+' : ''}{changePercent.toFixed(2)}%</span>
        </div>
      </div>

      {/* Bid/Ask Row */}
      <div style={bidAskRowStyle}>
        <div style={bidAskContainerStyle}>
          <span style={bidAskLabelStyle}>Bid</span>
          <span style={bidStyle}>{formatCurrency(bid)}</span>
          <span style={sizeStyle}>x {formatNumber(bidSize)}</span>
        </div>

        <div style={spreadContainerStyle}>
          <span style={{ ...bidAskLabelStyle, color: colors.gold }}>Spread</span>
          <span style={spreadStyle}>{formatCurrency(spread)}</span>
          <span style={sizeStyle}>({spreadPercent.toFixed(2)}%)</span>
        </div>

        <div style={bidAskContainerStyle}>
          <span style={bidAskLabelStyle}>Ask</span>
          <span style={askStyle}>{formatCurrency(ask)}</span>
          <span style={sizeStyle}>x {formatNumber(askSize)}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={gridStyle}>
        <div style={metricCellStyle}>
          <div style={labelStyle}>Day High</div>
          <div style={valueStyle}>{formatCurrency(dayHigh)}</div>
        </div>
        <div style={metricCellStyle}>
          <div style={labelStyle}>Day Low</div>
          <div style={valueStyle}>{formatCurrency(dayLow)}</div>
        </div>
        <div style={metricCellStyle}>
          <div style={labelStyle}>Open</div>
          <div style={valueStyle}>{formatCurrency(dayOpen)}</div>
        </div>
        <div style={metricCellStyle}>
          <div style={labelStyle}>Prev Close</div>
          <div style={valueStyle}>{formatCurrency(prevClose)}</div>
        </div>
        <div style={metricCellStyle}>
          <div style={labelStyle}>Mid</div>
          <div style={valueStyle}>{formatCurrency(mid)}</div>
        </div>
        <div style={metricCellStyle}>
          <div style={labelStyle}>Volume</div>
          <div style={valueStyle}>{formatNumber(volume)}</div>
        </div>
      </div>

      {/* Footer */}
      <div style={footerStyle}>
        <span style={timestampStyle}>Last updated: {formatTime(timestamp)}</span>
        <span style={{ ...timestampStyle, color: colors.cyan }}>NBBO</span>
      </div>
    </div>
  );
}

export default StockQuoteCard;
