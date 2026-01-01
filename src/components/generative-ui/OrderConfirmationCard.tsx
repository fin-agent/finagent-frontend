'use client';

import React from 'react';

export interface OrderConfirmationProps {
  symbol: string;
  companyName: string;
  side: 'buy' | 'sell';
  quantity: number;
  orderType: 'market' | 'limit';
  limitPrice: number | null;
  currentPrice: number;
  estimatedTotal: number;
  currentPosition: {
    qty: number;
    side: 'long' | 'short';
    marketValue: number;
    avgEntryPrice: number;
  } | null;
  positionAction: 'close_long' | 'partial_sell' | 'short_sell' | 'split_order' | 'buy' | null;
  splitOrder: {
    longQty: number;
    shortQty: number;
  } | null;
  marketStatus?: {
    isOpen: boolean;
    nextOpen: string;
    nextClose: string;
  };
}

// Terminal Luxe color palette
const colors = {
  bgCard: '#0c0c12',
  bgCardSecondary: '#101018',
  bgRow: '#0e0e16',
  bgRowAlt: '#12121c',
  border: '#1e1e2a',
  borderAccent: '#2a2a3a',
  textMuted: '#4a4a5c',
  textLabel: '#6a6a7c',
  textValue: '#e8e8ec',
  textTitle: '#9a9aac',
  green: '#50fa7b',
  greenMuted: '#22c55e',
  red: '#ff5555',
  redMuted: '#ef4444',
  gold: '#f0c674',
  blue: '#60a5fa',
  cyan: '#8be9fd',
  purple: '#bd93f9',
  white: '#ffffff',
};

const formatCurrency = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
};

const formatNumber = (value: number): string => {
  return new Intl.NumberFormat('en-US').format(value);
};

// Card container style
const cardStyle: React.CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  borderRadius: '12px',
  background: colors.bgCard,
  border: `1px solid ${colors.border}`,
  boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
  fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
};

// Header style
const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 18px',
  borderBottom: `1px solid ${colors.border}`,
  background: `linear-gradient(180deg, ${colors.bgCardSecondary} 0%, ${colors.bgCard} 100%)`,
};

const titleStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: colors.textTitle,
  margin: 0,
};

// Data row style
const dataRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 18px',
  borderBottom: `1px solid ${colors.border}`,
};

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: colors.textLabel,
};

const valueStyle: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 600,
  letterSpacing: '-0.01em',
  color: colors.textValue,
  textAlign: 'right',
};

// Decorative top accent line
const AccentLine = ({ color }: { color: string }) => (
  <div style={{
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '2px',
    background: `linear-gradient(90deg, transparent 0%, ${color} 50%, transparent 100%)`,
  }} />
);

// Status badge
const StatusBadge = ({ text, color }: { text: string; color: string }) => (
  <span style={{
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 10px',
    borderRadius: '4px',
    background: `${color}15`,
    border: `1px solid ${color}40`,
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: color,
  }}>
    {text}
  </span>
);

// Section Header
const SectionHeader = ({ title, color }: { title: string; color: string }) => (
  <div style={{
    padding: '10px 18px',
    background: colors.bgCardSecondary,
    borderBottom: `1px solid ${colors.border}`,
    borderLeft: `3px solid ${color}`,
  }}>
    <span style={{
      fontSize: '10px',
      fontWeight: 600,
      letterSpacing: '0.15em',
      textTransform: 'uppercase',
      color: color,
    }}>{title}</span>
  </div>
);

// Data Row Component
const DataRow = ({
  label,
  value,
  valueColor = colors.textValue,
  isAlt = false,
}: {
  label: string;
  value: string;
  valueColor?: string;
  isAlt?: boolean;
}) => (
  <div style={{
    ...dataRowStyle,
    background: isAlt ? colors.bgRowAlt : colors.bgRow,
  }}>
    <span style={labelStyle}>{label}</span>
    <span style={{ ...valueStyle, color: valueColor }}>{value}</span>
  </div>
);

export function OrderConfirmationCard(props: OrderConfirmationProps) {
  const {
    symbol,
    companyName,
    side,
    quantity,
    orderType,
    limitPrice,
    currentPrice,
    estimatedTotal,
    currentPosition,
    positionAction,
    splitOrder,
    marketStatus,
  } = props;

  const isBuy = side === 'buy';
  const accentColor = isBuy ? colors.green : colors.red;
  const orderTypeLabel = orderType === 'limit' ? 'LIMIT' : 'MARKET';
  const sideLabel = isBuy ? 'BUY' : 'SELL';

  // Get position action description
  const getPositionActionLabel = (): string | null => {
    if (!positionAction || positionAction === 'buy') return null;
    switch (positionAction) {
      case 'close_long': return 'Closing Position';
      case 'partial_sell': return 'Partial Sell';
      case 'short_sell': return 'Short Sell';
      case 'split_order': return 'Split Order';
      default: return null;
    }
  };

  const positionActionLabel = getPositionActionLabel();

  return (
    <div style={cardStyle} data-testid="order-confirmation-card">
      <AccentLine color={accentColor} />

      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h3 style={titleStyle}>Order Confirmation</h3>
          <StatusBadge text={sideLabel} color={accentColor} />
          <StatusBadge text={orderTypeLabel} color={orderType === 'limit' ? colors.gold : colors.cyan} />
        </div>
        {marketStatus && !marketStatus.isOpen && (
          <StatusBadge text="Market Closed" color={colors.purple} />
        )}
      </div>

      {/* Symbol & Company Hero */}
      <div style={{
        padding: '20px 18px',
        background: `linear-gradient(135deg, ${colors.bgCardSecondary} 0%, ${colors.bgCard} 100%)`,
        borderBottom: `1px solid ${colors.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '10px',
            background: `linear-gradient(135deg, ${accentColor}20 0%, ${accentColor}08 100%)`,
            border: `1px solid ${accentColor}40`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 16px ${accentColor}15`,
          }}>
            <span style={{ fontSize: '22px' }}>{isBuy ? '📈' : '📉'}</span>
          </div>
          <div>
            <div style={{
              fontSize: '20px',
              fontWeight: 700,
              color: colors.white,
              letterSpacing: '-0.01em',
            }}>
              {symbol}
            </div>
            <div style={{
              fontSize: '12px',
              color: colors.textMuted,
              marginTop: '2px',
            }}>
              {companyName}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: colors.textMuted,
            marginBottom: '4px',
          }}>
            Quantity
          </div>
          <div style={{
            fontSize: '28px',
            fontWeight: 700,
            color: accentColor,
            letterSpacing: '-0.02em',
            textShadow: `0 0 20px ${accentColor}40`,
          }}>
            {formatNumber(quantity)}
          </div>
          <div style={{
            fontSize: '11px',
            color: colors.textMuted,
            marginTop: '2px',
          }}>
            shares
          </div>
        </div>
      </div>

      {/* Position Action Alert (for sells) */}
      {positionActionLabel && (
        <div style={{
          padding: '12px 18px',
          background: positionAction === 'split_order' ? `${colors.purple}10` : `${colors.red}08`,
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <span style={{ fontSize: '14px' }}>
            {positionAction === 'split_order' ? '⚡' : positionAction === 'short_sell' ? '📊' : '💰'}
          </span>
          <span style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.05em',
            color: positionAction === 'split_order' ? colors.purple : colors.textValue,
          }}>
            {positionActionLabel}
          </span>
        </div>
      )}

      {/* Split Order Details */}
      {splitOrder && (
        <>
          <SectionHeader title="Order Breakdown" color={colors.purple} />
          <DataRow
            label="Sell Long"
            value={`${formatNumber(splitOrder.longQty)} shares`}
            valueColor={colors.green}
          />
          <DataRow
            label="Sell Short"
            value={`${formatNumber(splitOrder.shortQty)} shares`}
            valueColor={colors.red}
            isAlt
          />
        </>
      )}

      {/* Order Details */}
      <SectionHeader title="Order Details" color={accentColor} />
      {orderType === 'limit' && limitPrice && (
        <DataRow
          label="Limit Price"
          value={formatCurrency(limitPrice)}
          valueColor={colors.gold}
        />
      )}
      <DataRow
        label="Current Price"
        value={formatCurrency(currentPrice)}
        isAlt={orderType === 'limit'}
      />
      <DataRow
        label={isBuy ? 'Estimated Cost' : 'Estimated Proceeds'}
        value={formatCurrency(estimatedTotal)}
        valueColor={isBuy ? colors.red : colors.green}
        isAlt={orderType !== 'limit'}
      />

      {/* Current Position (for sells) */}
      {currentPosition && (
        <>
          <SectionHeader title="Current Position" color={colors.blue} />
          <DataRow
            label="Position"
            value={`${currentPosition.qty > 0 ? 'Long' : 'Short'} ${formatNumber(Math.abs(currentPosition.qty))} shares`}
            valueColor={currentPosition.qty > 0 ? colors.green : colors.red}
          />
          <DataRow
            label="Avg Entry Price"
            value={formatCurrency(currentPosition.avgEntryPrice)}
            isAlt
          />
          <DataRow
            label="Market Value"
            value={formatCurrency(currentPosition.marketValue)}
          />
        </>
      )}

      {/* Confirmation Footer */}
      <div style={{
        padding: '16px 18px',
        background: colors.bgCardSecondary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
      }}>
        <span style={{
          fontSize: '11px',
          fontWeight: 500,
          color: colors.textMuted,
          letterSpacing: '0.05em',
        }}>
          Awaiting confirmation...
        </span>
        <span style={{
          display: 'inline-block',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: colors.gold,
          animation: 'pulse 1.5s ease-in-out infinite',
          boxShadow: `0 0 8px ${colors.gold}60`,
        }} />
      </div>

      {/* Inline keyframes for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.9); }
        }
      `}</style>
    </div>
  );
}
