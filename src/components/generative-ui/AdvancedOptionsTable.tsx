'use client';

import React from 'react';
import { ArrowUpRight, ArrowDownRight, Clock, Target, Layers } from 'lucide-react';

interface OptionTrade {
  TradeID: number;
  Date: string;
  Symbol: string;
  SecurityType: string;
  TradeType: string;
  Strike?: string;
  Expiration?: string;
  'Call/Put'?: string;
  OptionContracts?: string;
  OptionTradePremium?: string;
  NetAmount: string;
}

interface AdvancedOptionsTableProps {
  trades: OptionTrade[];
  symbol?: string;
  callPut?: 'call' | 'put';
  tradeType?: 'buy' | 'sell' | 'all';
  timePeriod?: string;
  aggregations?: {
    tradeCount?: number;
    totalTrades?: number;
    totalPremium: number;
    avgPremium?: number;
    totalContracts?: number;
    callCount: number;
    putCount: number;
  };
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

// Terminal Luxe color palette
const colors = {
  bgVoid: '#000000',
  bgSurface: '#0a0a0a',
  bgElevated: '#141414',
  bgCard: '#1a1a1a',
  bgHeader: '#1f1f1f',
  border: '#2a2a2a',
  borderAccent: '#333333',
  textPrimary: '#ffffff',
  textSecondary: '#8c8c8e',
  textMuted: '#5a5a5c',
  accent: '#00c806',
  accentDim: 'rgba(0, 200, 6, 0.15)',
  buy: '#00c806',
  sell: '#ff5252',
  call: '#4da6ff',
  put: '#ffa64d',
  purple: '#8b5cf6',
  purpleDim: 'rgba(139, 92, 246, 0.15)',
};

export function AdvancedOptionsTable({ trades, symbol, callPut, tradeType, timePeriod, aggregations }: AdvancedOptionsTableProps) {
  const tradeTypeLabel = tradeType === 'sell' ? 'Short' : tradeType === 'buy' ? 'Long' : '';
  const callPutLabel = callPut === 'call' ? 'Call' : callPut === 'put' ? 'Put' : '';
  const title = `${tradeTypeLabel} ${callPutLabel} Options${symbol ? ` on ${symbol}` : ''}`.trim();

  const styles: Record<string, React.CSSProperties> = {
    container: {
      backgroundColor: colors.bgCard,
      borderRadius: '16px',
      border: `1px solid ${colors.border}`,
      overflow: 'hidden',
      marginTop: '12px',
      marginBottom: '12px',
      boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 20px',
      background: `linear-gradient(135deg, ${colors.bgHeader} 0%, ${colors.bgElevated} 100%)`,
      borderBottom: `1px solid ${colors.border}`,
    },
    headerLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },
    headerIcon: {
      width: '36px',
      height: '36px',
      borderRadius: '10px',
      background: `linear-gradient(135deg, ${colors.purple} 0%, #6d28d9 100%)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)',
    },
    headerTitle: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '15px',
      fontWeight: 600,
      color: colors.textPrimary,
      letterSpacing: '-0.2px',
    },
    headerSubtitle: {
      fontSize: '12px',
      color: colors.textMuted,
      marginTop: '2px',
    },
    filterChips: {
      display: 'flex',
      gap: '8px',
      flexWrap: 'wrap' as const,
    },
    chip: {
      fontSize: '10px',
      fontWeight: 600,
      padding: '4px 10px',
      borderRadius: '12px',
      letterSpacing: '0.3px',
      textTransform: 'uppercase' as const,
    },
    aggregationBar: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '1px',
      backgroundColor: colors.border,
      borderBottom: `1px solid ${colors.border}`,
    },
    aggItem: {
      padding: '14px 16px',
      backgroundColor: colors.bgElevated,
      textAlign: 'center' as const,
    },
    aggLabel: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '9px',
      fontWeight: 600,
      color: colors.textMuted,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.8px',
      marginBottom: '6px',
    },
    aggValue: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '16px',
      fontWeight: 700,
      color: colors.textPrimary,
    },
    tableWrapper: {
      overflowX: 'auto' as const,
      WebkitOverflowScrolling: 'touch' as const,
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
      fontSize: '13px',
    },
    th: {
      padding: '12px 14px',
      textAlign: 'left' as const,
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '10px',
      fontWeight: 600,
      color: colors.textMuted,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
      borderBottom: `1px solid ${colors.border}`,
      backgroundColor: colors.bgSurface,
      whiteSpace: 'nowrap' as const,
    },
    thRight: {
      textAlign: 'right' as const,
    },
    thCenter: {
      textAlign: 'center' as const,
    },
    td: {
      padding: '14px 14px',
      borderBottom: `1px solid ${colors.border}`,
      color: colors.textPrimary,
      whiteSpace: 'nowrap' as const,
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '13px',
    },
    tdRight: {
      textAlign: 'right' as const,
    },
    tdCenter: {
      textAlign: 'center' as const,
    },
    badge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      fontSize: '11px',
      fontWeight: 600,
      padding: '4px 8px',
      borderRadius: '6px',
    },
    callBadge: {
      backgroundColor: 'rgba(77, 166, 255, 0.15)',
      color: colors.call,
    },
    putBadge: {
      backgroundColor: 'rgba(255, 166, 77, 0.15)',
      color: colors.put,
    },
    buyBadge: {
      backgroundColor: colors.accentDim,
      color: colors.buy,
    },
    sellBadge: {
      backgroundColor: 'rgba(255, 82, 82, 0.15)',
      color: colors.sell,
    },
    strikePill: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '12px',
      fontWeight: 600,
      padding: '4px 10px',
      borderRadius: '8px',
      backgroundColor: colors.bgHeader,
      color: colors.textPrimary,
      border: `1px solid ${colors.borderAccent}`,
    },
    emptyState: {
      padding: '48px 24px',
      textAlign: 'center' as const,
      color: colors.textMuted,
    },
    emptyIcon: {
      width: '48px',
      height: '48px',
      borderRadius: '12px',
      backgroundColor: colors.bgHeader,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0 auto 16px',
    },
  };

  if (trades.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.headerIcon}>
              <Layers size={18} color="#fff" />
            </div>
            <div>
              <div style={styles.headerTitle}>{title || 'Options Query'}</div>
              <div style={styles.headerSubtitle}>No matching trades found</div>
            </div>
          </div>
        </div>
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>
            <Target size={24} color={colors.textMuted} />
          </div>
          <p style={{ margin: 0, fontSize: '14px' }}>No options match your criteria</p>
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: colors.textMuted }}>
            Try adjusting your filters
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.headerIcon}>
            <Layers size={18} color="#fff" />
          </div>
          <div>
            <div style={styles.headerTitle}>{title || 'Options Query Results'}</div>
            <div style={styles.headerSubtitle}>
              {aggregations?.totalTrades || trades.length} trades found
              {timePeriod && ` • ${timePeriod}`}
            </div>
          </div>
        </div>
        <div style={styles.filterChips}>
          {tradeType && (
            <span style={{
              ...styles.chip,
              ...(tradeType === 'sell' ? styles.sellBadge : styles.buyBadge),
            }}>
              {tradeType === 'sell' ? 'Short' : 'Long'}
            </span>
          )}
          {callPut && (
            <span style={{
              ...styles.chip,
              ...(callPut === 'call' ? styles.callBadge : styles.putBadge),
            }}>
              {callPut}
            </span>
          )}
        </div>
      </div>

      {/* Aggregation Bar */}
      {aggregations && (
        <div style={styles.aggregationBar}>
          <div style={styles.aggItem}>
            <div style={styles.aggLabel}>Total Trades</div>
            <div style={styles.aggValue}>{aggregations.totalTrades || trades.length}</div>
          </div>
          <div style={styles.aggItem}>
            <div style={styles.aggLabel}>Total Premium</div>
            <div style={{ ...styles.aggValue, color: colors.accent }}>
              {formatCurrency(aggregations.totalPremium)}
            </div>
          </div>
          <div style={styles.aggItem}>
            <div style={styles.aggLabel}>Avg Premium</div>
            <div style={styles.aggValue}>{formatCurrency(aggregations.avgPremium || 0)}</div>
          </div>
          <div style={styles.aggItem}>
            <div style={styles.aggLabel}>Calls / Puts</div>
            <div style={styles.aggValue}>
              <span style={{ color: colors.call }}>{aggregations.callCount}</span>
              <span style={{ color: colors.textMuted }}> / </span>
              <span style={{ color: colors.put }}>{aggregations.putCount}</span>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Date</th>
              <th style={{ ...styles.th, ...styles.thCenter }}>Type</th>
              <th style={{ ...styles.th, ...styles.thCenter }}>C/P</th>
              <th style={{ ...styles.th, ...styles.thRight }}>Strike</th>
              <th style={styles.th}>Expiration</th>
              <th style={{ ...styles.th, ...styles.thRight }}>Contracts</th>
              <th style={{ ...styles.th, ...styles.thRight }}>Premium</th>
            </tr>
          </thead>
          <tbody>
            {trades.slice(0, 10).map((trade, index) => {
              const netAmount = parseFloat(trade.NetAmount || '0');
              const contracts = parseFloat(trade.OptionContracts || '0');
              const strike = parseFloat(trade.Strike || '0');
              const isCall = trade['Call/Put'] === 'C';
              const isBuy = trade.TradeType === 'B';

              return (
                <tr
                  key={trade.TradeID}
                  style={{
                    backgroundColor: index % 2 === 0 ? colors.bgCard : colors.bgElevated,
                  }}
                >
                  <td style={styles.td}>{formatDate(trade.Date)}</td>
                  <td style={{ ...styles.td, ...styles.tdCenter }}>
                    <span style={{
                      ...styles.badge,
                      ...(isBuy ? styles.buyBadge : styles.sellBadge),
                    }}>
                      {isBuy ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {isBuy ? 'Buy' : 'Sell'}
                    </span>
                  </td>
                  <td style={{ ...styles.td, ...styles.tdCenter }}>
                    <span style={{
                      ...styles.badge,
                      ...(isCall ? styles.callBadge : styles.putBadge),
                    }}>
                      {isCall ? 'Call' : 'Put'}
                    </span>
                  </td>
                  <td style={{ ...styles.td, ...styles.tdRight }}>
                    <span style={styles.strikePill}>${strike.toFixed(0)}</span>
                  </td>
                  <td style={styles.td}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={12} color={colors.textMuted} />
                      {trade.Expiration ? formatDate(trade.Expiration) : '-'}
                    </span>
                  </td>
                  <td style={{ ...styles.td, ...styles.tdRight }}>{contracts}</td>
                  <td style={{
                    ...styles.td,
                    ...styles.tdRight,
                    color: netAmount >= 0 ? colors.buy : colors.sell,
                    fontWeight: 600,
                  }}>
                    {formatCurrency(Math.abs(netAmount))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {trades.length > 10 && (
        <div style={{
          padding: '12px 16px',
          textAlign: 'center',
          borderTop: `1px solid ${colors.border}`,
          backgroundColor: colors.bgElevated,
          fontSize: '12px',
          color: colors.textMuted,
        }}>
          Showing 10 of {trades.length} trades
        </div>
      )}
    </div>
  );
}
