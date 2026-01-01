'use client';

import React from 'react';

interface OrderResult {
  orderId: string;
  symbol: string;
  companyName: string;
  side: 'buy' | 'sell';
  quantity: number;
  orderType: 'market' | 'limit';
  limitPrice: number | null;
  status: string;
  description: string;
}

export interface OrderExecutionProps {
  success: boolean;
  orders: OrderResult[];
  message: string;
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
const StatusBadge = ({ text, color, pulse = false }: { text: string; color: string; pulse?: boolean }) => (
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
    animation: pulse ? 'statusPulse 2s ease-in-out infinite' : undefined,
  }}>
    {text}
  </span>
);

// Get status color
const getStatusColor = (status: string): string => {
  const normalizedStatus = status.toLowerCase();
  if (['filled', 'accepted', 'new'].includes(normalizedStatus)) return colors.green;
  if (['pending_new', 'partially_filled'].includes(normalizedStatus)) return colors.gold;
  if (['canceled', 'rejected', 'expired', 'failed'].includes(normalizedStatus)) return colors.red;
  return colors.blue;
};

// Get status icon
const getStatusIcon = (status: string, success: boolean): string => {
  if (!success) return '❌';
  const normalizedStatus = status.toLowerCase();
  if (['filled', 'accepted', 'new'].includes(normalizedStatus)) return '✅';
  if (['pending_new', 'partially_filled'].includes(normalizedStatus)) return '⏳';
  if (['canceled'].includes(normalizedStatus)) return '🚫';
  if (['rejected', 'expired', 'failed'].includes(normalizedStatus)) return '❌';
  return '📋';
};

// Order Row Component
const OrderRow = ({ order, success }: { order: OrderResult; success: boolean }) => {
  const statusColor = getStatusColor(order.status);
  const icon = getStatusIcon(order.status, success);
  const sideColor = order.side === 'buy' ? colors.green : colors.red;

  return (
    <div style={{
      padding: '16px 18px',
      borderBottom: `1px solid ${colors.border}`,
      background: colors.bgRow,
    }}>
      {/* Top row: Symbol, side, status */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '18px' }}>{icon}</span>
          <div>
            <div style={{
              fontSize: '16px',
              fontWeight: 700,
              color: colors.white,
              letterSpacing: '-0.01em',
            }}>
              {order.symbol}
            </div>
            <div style={{
              fontSize: '11px',
              color: colors.textMuted,
              marginTop: '2px',
            }}>
              {order.companyName}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <StatusBadge
            text={order.side.toUpperCase()}
            color={sideColor}
          />
          <StatusBadge
            text={order.status}
            color={statusColor}
            pulse={['pending_new', 'new'].includes(order.status.toLowerCase())}
          />
        </div>
      </div>

      {/* Order details */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '12px',
        padding: '12px',
        background: colors.bgRowAlt,
        borderRadius: '6px',
      }}>
        <div>
          <div style={{
            fontSize: '9px',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: colors.textMuted,
            marginBottom: '4px',
          }}>
            Quantity
          </div>
          <div style={{
            fontSize: '14px',
            fontWeight: 600,
            color: colors.textValue,
          }}>
            {formatNumber(order.quantity)} shares
          </div>
        </div>
        <div>
          <div style={{
            fontSize: '9px',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: colors.textMuted,
            marginBottom: '4px',
          }}>
            Type
          </div>
          <div style={{
            fontSize: '14px',
            fontWeight: 600,
            color: order.orderType === 'limit' ? colors.gold : colors.cyan,
          }}>
            {order.orderType === 'limit' ? `Limit @ ${formatCurrency(order.limitPrice)}` : 'Market'}
          </div>
        </div>
        <div>
          <div style={{
            fontSize: '9px',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: colors.textMuted,
            marginBottom: '4px',
          }}>
            Order ID
          </div>
          <div style={{
            fontSize: '11px',
            fontWeight: 500,
            color: colors.textLabel,
            fontFamily: 'monospace',
            wordBreak: 'break-all',
          }}>
            {order.orderId.substring(0, 8)}...
          </div>
        </div>
      </div>

      {/* Description */}
      <div style={{
        marginTop: '10px',
        fontSize: '11px',
        color: colors.textMuted,
        fontStyle: 'italic',
      }}>
        {order.description}
      </div>
    </div>
  );
};

export function OrderExecutionCard(props: OrderExecutionProps) {
  const { success, orders, message } = props;

  const accentColor = success ? colors.green : colors.red;
  const headerIcon = success ? '✅' : '❌';

  // Handle cancelled order (no orders array)
  if (orders.length === 0) {
    return (
      <div style={cardStyle} data-testid="order-execution-card">
        <AccentLine color={colors.textMuted} />
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '16px' }}>🚫</span>
            <h3 style={titleStyle}>Order Cancelled</h3>
          </div>
        </div>
        <div style={{
          padding: '32px 18px',
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: '48px',
            marginBottom: '16px',
          }}>
            🚫
          </div>
          <div style={{
            fontSize: '14px',
            color: colors.textValue,
            marginBottom: '8px',
          }}>
            {message}
          </div>
          <div style={{
            fontSize: '11px',
            color: colors.textMuted,
          }}>
            No order was placed.
          </div>
        </div>
      </div>
    );
  }

  const isSplitOrder = orders.length > 1;

  return (
    <div style={cardStyle} data-testid="order-execution-card">
      <AccentLine color={accentColor} />

      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '16px' }}>{headerIcon}</span>
          <h3 style={titleStyle}>
            {success ? 'Order Submitted' : 'Order Failed'}
          </h3>
          {isSplitOrder && (
            <StatusBadge text="Split Order" color={colors.purple} />
          )}
        </div>
        <StatusBadge
          text={success ? 'Success' : 'Failed'}
          color={accentColor}
        />
      </div>

      {/* Success/Error Banner */}
      <div style={{
        padding: '16px 18px',
        background: success
          ? `linear-gradient(135deg, ${colors.green}08 0%, ${colors.bgCard} 100%)`
          : `linear-gradient(135deg, ${colors.red}08 0%, ${colors.bgCard} 100%)`,
        borderBottom: `1px solid ${colors.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          background: `${accentColor}15`,
          border: `1px solid ${accentColor}30`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <span style={{ fontSize: '20px' }}>{success ? '🎉' : '⚠️'}</span>
        </div>
        <div>
          <div style={{
            fontSize: '13px',
            fontWeight: 600,
            color: colors.textValue,
            marginBottom: '2px',
          }}>
            {success
              ? (isSplitOrder ? 'Orders Submitted Successfully' : 'Order Submitted Successfully')
              : 'Order Submission Failed'}
          </div>
          <div style={{
            fontSize: '11px',
            color: colors.textMuted,
          }}>
            {message}
          </div>
        </div>
      </div>

      {/* Order List */}
      {orders.map((order, index) => (
        <OrderRow key={order.orderId || index} order={order} success={success} />
      ))}

      {/* Footer with tip */}
      {success && (
        <div style={{
          padding: '14px 18px',
          background: colors.bgCardSecondary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}>
          <span style={{ fontSize: '12px' }}>💡</span>
          <span style={{
            fontSize: '11px',
            color: colors.textMuted,
          }}>
            Check your trading app for execution details and fill price
          </span>
        </div>
      )}

      {/* Inline keyframes for pulse animation */}
      <style>{`
        @keyframes statusPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
