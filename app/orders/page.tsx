'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { OrderResponse, OrderStatus } from '@/src/services/alpacaTrading';

// Terminal Luxe color palette
const colors = {
  bg: '#0a0a0f',
  bgCard: '#0c0c12',
  bgCardSecondary: '#101018',
  bgRow: '#0e0e16',
  bgRowAlt: '#12121c',
  bgRowHover: '#1a1a24',
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
  orange: '#ffb86c',
  white: '#ffffff',
};

const statusColors: Record<OrderStatus, string> = {
  new: colors.blue,
  partially_filled: colors.cyan,
  filled: colors.green,
  done_for_day: colors.textMuted,
  canceled: colors.textMuted,
  expired: colors.textMuted,
  replaced: colors.purple,
  pending_cancel: colors.orange,
  pending_replace: colors.orange,
  pending_new: colors.gold,
  accepted: colors.blue,
  stopped: colors.red,
  rejected: colors.red,
  suspended: colors.red,
  calculated: colors.textMuted,
};

function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(value: string | null): string {
  if (!value) return '-';
  const num = parseFloat(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(num);
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders?status=${filter}&limit=100`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setOrders(data.orders || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleCancelOrder = async (orderId: string) => {
    setCancellingId(orderId);
    try {
      const res = await fetch(`/api/orders?orderId=${orderId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) {
        alert(`Failed to cancel: ${data.error}`);
      } else {
        fetchOrders();
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to cancel order'}`);
    } finally {
      setCancellingId(null);
    }
  };

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    backgroundColor: colors.bg,
    padding: '24px',
    fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: `1px solid ${colors.border}`,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '24px',
    fontWeight: 700,
    color: colors.white,
    letterSpacing: '-0.02em',
    margin: 0,
  };

  const filterContainerStyle: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
  };

  const filterButtonStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '8px 16px',
    borderRadius: '6px',
    border: `1px solid ${isActive ? colors.green : colors.border}`,
    background: isActive ? `${colors.green}15` : 'transparent',
    color: isActive ? colors.green : colors.textLabel,
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  });

  const tableContainerStyle: React.CSSProperties = {
    background: colors.bgCard,
    borderRadius: '12px',
    border: `1px solid ${colors.border}`,
    overflow: 'hidden',
    boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
  };

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
  };

  const thStyle: React.CSSProperties = {
    padding: '14px 16px',
    textAlign: 'left',
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: colors.textTitle,
    background: colors.bgCardSecondary,
    borderBottom: `1px solid ${colors.border}`,
  };

  const tdStyle = (isAlt: boolean): React.CSSProperties => ({
    padding: '12px 16px',
    fontSize: '13px',
    color: colors.textValue,
    background: isAlt ? colors.bgRowAlt : colors.bgRow,
    borderBottom: `1px solid ${colors.border}`,
  });

  const badgeStyle = (color: string): React.CSSProperties => ({
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '4px',
    background: `${color}15`,
    border: `1px solid ${color}40`,
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: color,
  });

  const cancelButtonStyle: React.CSSProperties = {
    padding: '6px 12px',
    borderRadius: '4px',
    border: `1px solid ${colors.red}40`,
    background: `${colors.red}10`,
    color: colors.red,
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  };

  const loadingStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: '48px',
    color: colors.textMuted,
    fontSize: '14px',
  };

  const errorStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: '48px',
    color: colors.red,
    fontSize: '14px',
  };

  const emptyStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: '48px',
    color: colors.textMuted,
    fontSize: '14px',
  };

  const refreshButtonStyle: React.CSSProperties = {
    padding: '8px 16px',
    borderRadius: '6px',
    border: `1px solid ${colors.cyan}`,
    background: `${colors.cyan}15`,
    color: colors.cyan,
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Orders</h1>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={filterContainerStyle}>
            {(['all', 'open', 'closed'] as const).map((f) => (
              <button
                key={f}
                style={filterButtonStyle(filter === f)}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <button style={refreshButtonStyle} onClick={fetchOrders} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div style={tableContainerStyle}>
        {loading ? (
          <div style={loadingStyle}>Loading orders...</div>
        ) : error ? (
          <div style={errorStyle}>{error}</div>
        ) : orders.length === 0 ? (
          <div style={emptyStyle}>No orders found</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Symbol</th>
                <th style={thStyle}>Side</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Qty</th>
                <th style={thStyle}>Filled</th>
                <th style={thStyle}>Limit Price</th>
                <th style={thStyle}>Avg Fill</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Submitted</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order, idx) => {
                const isAlt = idx % 2 === 1;
                const isBuy = order.side === 'buy';
                const statusColor = statusColors[order.status] || colors.textMuted;
                const canCancel = ['new', 'accepted', 'pending_new', 'partially_filled'].includes(order.status);

                return (
                  <tr key={order.id}>
                    <td style={{ ...tdStyle(isAlt), fontWeight: 600, color: colors.white }}>
                      {order.symbol}
                    </td>
                    <td style={tdStyle(isAlt)}>
                      <span style={badgeStyle(isBuy ? colors.green : colors.red)}>
                        {order.side}
                      </span>
                    </td>
                    <td style={tdStyle(isAlt)}>
                      <span style={{ color: order.type === 'limit' ? colors.gold : colors.cyan }}>
                        {order.type}
                      </span>
                    </td>
                    <td style={tdStyle(isAlt)}>{order.qty}</td>
                    <td style={tdStyle(isAlt)}>
                      {order.filled_qty !== '0' ? (
                        <span style={{ color: colors.green }}>{order.filled_qty}</span>
                      ) : (
                        <span style={{ color: colors.textMuted }}>0</span>
                      )}
                    </td>
                    <td style={tdStyle(isAlt)}>
                      {order.limit_price ? formatCurrency(order.limit_price) : '-'}
                    </td>
                    <td style={tdStyle(isAlt)}>
                      {order.filled_avg_price ? (
                        <span style={{ color: colors.green }}>
                          {formatCurrency(order.filled_avg_price)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td style={tdStyle(isAlt)}>
                      <span style={badgeStyle(statusColor)}>{order.status}</span>
                    </td>
                    <td style={{ ...tdStyle(isAlt), color: colors.textMuted, fontSize: '12px' }}>
                      {formatDate(order.submitted_at)}
                    </td>
                    <td style={tdStyle(isAlt)}>
                      {canCancel && (
                        <button
                          style={cancelButtonStyle}
                          onClick={() => handleCancelOrder(order.id)}
                          disabled={cancellingId === order.id}
                        >
                          {cancellingId === order.id ? '...' : 'Cancel'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: '16px', color: colors.textMuted, fontSize: '12px' }}>
        Showing {orders.length} order{orders.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
