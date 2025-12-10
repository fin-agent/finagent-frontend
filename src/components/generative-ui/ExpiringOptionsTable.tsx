'use client';

import React from 'react';
import { Clock, AlertTriangle, ArrowUpRight, ArrowDownRight, Flame } from 'lucide-react';

interface ExpiringOption {
  TradeID: number;
  Date: string;
  Symbol: string;
  SecurityType: string;
  TradeType: string;
  Strike?: string;
  Expiration?: string;
  'Call/Put'?: string;
  OptionContracts?: string;
  NetAmount: string;
}

interface ExpiringOptionsTableProps {
  trades: ExpiringOption[];
  expirationPeriod: string; // "tomorrow", "this week", "this month"
  aggregations?: {
    tradeCount?: number;
    totalPremium?: number;
    callCount?: number;
    putCount?: number;
    totalContracts?: number;
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
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

// Calculate days until expiration
const getDaysUntil = (expirationStr: string): number => {
  const exp = new Date(expirationStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);
  const diffTime = exp.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Terminal Luxe color palette with urgency indicators
const colors = {
  bgVoid: '#000000',
  bgSurface: '#0a0a0a',
  bgElevated: '#141414',
  bgCard: '#1a1a1a',
  bgHeader: '#1f1f1f',
  border: '#2a2a2a',
  textPrimary: '#ffffff',
  textSecondary: '#8c8c8e',
  textMuted: '#5a5a5c',
  accent: '#00c806',
  urgent: '#ff5252',
  urgentDim: 'rgba(255, 82, 82, 0.15)',
  warning: '#ffa64d',
  warningDim: 'rgba(255, 166, 77, 0.15)',
  buy: '#00c806',
  sell: '#ff5252',
  call: '#4da6ff',
  put: '#ffa64d',
};

export function ExpiringOptionsTable({
  trades,
  expirationPeriod,
  aggregations: externalAggregations,
}: ExpiringOptionsTableProps) {
  const isUrgent = expirationPeriod.toLowerCase() === 'tomorrow';
  const accentColor = isUrgent ? colors.urgent : colors.warning;

  // Calculate aggregations from trades if not provided
  const aggregations = {
    tradeCount: externalAggregations?.tradeCount ?? trades.length,
    totalPremium: externalAggregations?.totalPremium ?? trades.reduce((sum, t) => sum + Math.abs(parseFloat(t.NetAmount || '0')), 0),
    callCount: externalAggregations?.callCount ?? trades.filter(t => t['Call/Put'] === 'C').length,
    putCount: externalAggregations?.putCount ?? trades.filter(t => t['Call/Put'] === 'P').length,
    totalContracts: externalAggregations?.totalContracts ?? trades.reduce((sum, t) => sum + parseFloat(t.OptionContracts || '0'), 0),
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      backgroundColor: colors.bgCard,
      borderRadius: '16px',
      border: `1px solid ${colors.border}`,
      overflow: 'hidden',
      marginTop: '12px',
      marginBottom: '12px',
      boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
      position: 'relative',
    },
    urgentBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '3px',
      background: isUrgent
        ? `linear-gradient(90deg, ${colors.urgent}, #ff7070, ${colors.urgent})`
        : `linear-gradient(90deg, ${colors.warning}, #ffcc70, ${colors.warning})`,
      animation: isUrgent ? 'pulse 2s infinite' : 'none',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '18px 24px',
      background: `linear-gradient(135deg, ${colors.bgHeader} 0%, ${colors.bgElevated} 100%)`,
      borderBottom: `1px solid ${colors.border}`,
    },
    headerLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
    },
    iconWrapper: {
      width: '44px',
      height: '44px',
      borderRadius: '12px',
      background: isUrgent
        ? `linear-gradient(135deg, ${colors.urgent} 0%, #cc4141 100%)`
        : `linear-gradient(135deg, ${colors.warning} 0%, #cc8541 100%)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: isUrgent
        ? '0 4px 16px rgba(255, 82, 82, 0.4)'
        : '0 4px 16px rgba(255, 166, 77, 0.4)',
      animation: isUrgent ? 'glow 2s infinite' : 'none',
    },
    headerText: {
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
    },
    headerTitle: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '16px',
      fontWeight: 700,
      color: colors.textPrimary,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    headerSubtitle: {
      fontSize: '12px',
      color: colors.textMuted,
    },
    urgentBadge: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '10px',
      fontWeight: 700,
      padding: '4px 10px',
      borderRadius: '6px',
      backgroundColor: colors.urgentDim,
      color: colors.urgent,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
    },
    countBadge: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '24px',
      fontWeight: 800,
      color: accentColor,
      display: 'flex',
      alignItems: 'baseline',
      gap: '4px',
    },
    countLabel: {
      fontSize: '12px',
      fontWeight: 600,
      color: colors.textMuted,
    },
    summaryBar: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '1px',
      backgroundColor: colors.border,
      borderBottom: `1px solid ${colors.border}`,
    },
    summaryItem: {
      padding: '14px 12px',
      backgroundColor: colors.bgElevated,
      textAlign: 'center',
    },
    summaryLabel: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '9px',
      fontWeight: 600,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.8px',
      marginBottom: '6px',
    },
    summaryValue: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '15px',
      fontWeight: 700,
      color: colors.textPrimary,
    },
    tableWrapper: {
      overflowX: 'auto',
      WebkitOverflowScrolling: 'touch',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '13px',
    },
    th: {
      padding: '12px 14px',
      textAlign: 'left',
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '10px',
      fontWeight: 600,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      borderBottom: `1px solid ${colors.border}`,
      backgroundColor: colors.bgSurface,
      whiteSpace: 'nowrap',
    },
    td: {
      padding: '14px 14px',
      borderBottom: `1px solid ${colors.border}`,
      color: colors.textPrimary,
      whiteSpace: 'nowrap',
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '13px',
    },
    expirationCell: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    daysIndicator: {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      fontSize: '11px',
      fontWeight: 600,
      padding: '3px 8px',
      borderRadius: '6px',
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
    strikePill: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '12px',
      fontWeight: 600,
      padding: '4px 10px',
      borderRadius: '8px',
      backgroundColor: colors.bgHeader,
      color: colors.textPrimary,
      border: `1px solid ${colors.border}`,
    },
    emptyState: {
      padding: '48px 24px',
      textAlign: 'center',
      color: colors.textMuted,
    },
    emptyIcon: {
      width: '56px',
      height: '56px',
      borderRadius: '14px',
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
        <div style={styles.urgentBar} />
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.iconWrapper}>
              <Clock size={22} color="#fff" strokeWidth={2} />
            </div>
            <div style={styles.headerText}>
              <span style={styles.headerTitle}>
                Options Expiring {expirationPeriod}
              </span>
              <span style={styles.headerSubtitle}>No options found</span>
            </div>
          </div>
        </div>
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>
            <Clock size={28} color={colors.textMuted} />
          </div>
          <p style={{ margin: 0, fontSize: '15px', fontWeight: 500 }}>
            No options expiring {expirationPeriod}
          </p>
          <p style={{ margin: '8px 0 0', fontSize: '12px' }}>
            You don&apos;t have any open positions expiring in this period
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.urgentBar} />

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.iconWrapper}>
            {isUrgent ? (
              <Flame size={22} color="#fff" strokeWidth={2} />
            ) : (
              <Clock size={22} color="#fff" strokeWidth={2} />
            )}
          </div>
          <div style={styles.headerText}>
            <span style={styles.headerTitle}>
              Options Expiring {expirationPeriod}
              {isUrgent && (
                <span style={styles.urgentBadge}>
                  <AlertTriangle size={10} />
                  Urgent
                </span>
              )}
            </span>
            <span style={styles.headerSubtitle}>
              {aggregations.tradeCount} position{aggregations.tradeCount !== 1 ? 's' : ''} require attention
            </span>
          </div>
        </div>
        <div style={styles.countBadge}>
          {aggregations.tradeCount}
          <span style={styles.countLabel}>expiring</span>
        </div>
      </div>

      {/* Summary Bar */}
      <div style={styles.summaryBar}>
        <div style={styles.summaryItem}>
          <div style={styles.summaryLabel}>Positions</div>
          <div style={styles.summaryValue}>{aggregations.tradeCount}</div>
        </div>
        <div style={styles.summaryItem}>
          <div style={styles.summaryLabel}>Contracts</div>
          <div style={styles.summaryValue}>{aggregations.totalContracts}</div>
        </div>
        <div style={styles.summaryItem}>
          <div style={styles.summaryLabel}>Calls / Puts</div>
          <div style={styles.summaryValue}>
            <span style={{ color: colors.call }}>{aggregations.callCount}</span>
            <span style={{ color: colors.textMuted }}> / </span>
            <span style={{ color: colors.put }}>{aggregations.putCount}</span>
          </div>
        </div>
        <div style={styles.summaryItem}>
          <div style={styles.summaryLabel}>Total Value</div>
          <div style={{ ...styles.summaryValue, color: colors.accent }}>
            {formatCurrency(aggregations.totalPremium)}
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Symbol</th>
              <th style={{ ...styles.th, textAlign: 'center' }}>Type</th>
              <th style={{ ...styles.th, textAlign: 'center' }}>C/P</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Strike</th>
              <th style={styles.th}>Expiration</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Contracts</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Value</th>
            </tr>
          </thead>
          <tbody>
            {trades.slice(0, 10).map((trade, index) => {
              const netAmount = parseFloat(trade.NetAmount || '0');
              const contracts = parseFloat(trade.OptionContracts || '0');
              const strike = parseFloat(trade.Strike || '0');
              const isCall = trade['Call/Put'] === 'C';
              const isBuy = trade.TradeType === 'B';
              const daysUntil = trade.Expiration ? getDaysUntil(trade.Expiration) : null;

              let daysColor = colors.textMuted;
              let daysBg = colors.bgHeader;
              if (daysUntil !== null) {
                if (daysUntil <= 1) {
                  daysColor = colors.urgent;
                  daysBg = colors.urgentDim;
                } else if (daysUntil <= 3) {
                  daysColor = colors.warning;
                  daysBg = colors.warningDim;
                }
              }

              return (
                <tr
                  key={trade.TradeID}
                  style={{
                    backgroundColor: index % 2 === 0 ? colors.bgCard : colors.bgElevated,
                  }}
                >
                  <td style={{ ...styles.td, fontWeight: 600 }}>{trade.Symbol}</td>
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <span style={{
                      ...styles.badge,
                      backgroundColor: isBuy ? 'rgba(0, 200, 6, 0.15)' : 'rgba(255, 82, 82, 0.15)',
                      color: isBuy ? colors.buy : colors.sell,
                    }}>
                      {isBuy ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {isBuy ? 'Long' : 'Short'}
                    </span>
                  </td>
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <span style={{
                      ...styles.badge,
                      backgroundColor: isCall ? 'rgba(77, 166, 255, 0.15)' : 'rgba(255, 166, 77, 0.15)',
                      color: isCall ? colors.call : colors.put,
                    }}>
                      {isCall ? 'Call' : 'Put'}
                    </span>
                  </td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>
                    <span style={styles.strikePill}>${strike.toFixed(0)}</span>
                  </td>
                  <td style={styles.td}>
                    <div style={styles.expirationCell}>
                      <span>{trade.Expiration ? formatDate(trade.Expiration) : '-'}</span>
                      {daysUntil !== null && (
                        <span style={{
                          ...styles.daysIndicator,
                          backgroundColor: daysBg,
                          color: daysColor,
                        }}>
                          <Clock size={10} />
                          {daysUntil === 0 ? 'Today' : daysUntil === 1 ? '1 day' : `${daysUntil} days`}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>{contracts}</td>
                  <td style={{
                    ...styles.td,
                    textAlign: 'right',
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
          Showing 10 of {trades.length} options
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 4px 16px rgba(255, 82, 82, 0.4); }
          50% { box-shadow: 0 4px 24px rgba(255, 82, 82, 0.6); }
        }
      `}</style>
    </div>
  );
}
