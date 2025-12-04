'use client';

import React from 'react';
import { Calendar, TrendingUp, ArrowUpRight, ArrowDownRight, Clock, Hash } from 'lucide-react';

interface Trade {
  TradeID: number;
  Date: string;
  Symbol: string;
  SecurityType: string;
  TradeType: string;
  StockTradePrice?: string;
  StockShareQty?: string;
  OptionContracts?: string;
  NetAmount: string;
  displayDate?: string; // User-friendly date like "Yesterday", "2 days ago"
}

interface TimePeriodInfo {
  description: string;  // "last week", "yesterday"
  displayRange: string; // "Dec 1 - Dec 4"
  tradingDays: number;
}

interface SummaryInfo {
  totalTrades: number;
  stockCount: number;
  optionCount: number;
  totalValue: number;
  averagePrice?: number;
}

interface TimeBasedTradesProps {
  timePeriod: TimePeriodInfo;
  summary: SummaryInfo;
  trades: Trade[];
  symbol?: string | null;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
};

// Colors matching the app theme
const colors = {
  bgCard: '#1a1a1a',
  bgHeader: '#252525',
  bgRow: '#1a1a1a',
  bgRowAlt: '#222222',
  border: '#333333',
  textPrimary: '#ffffff',
  textSecondary: '#999999',
  textMuted: '#666666',
  accent: '#00c806',
  buy: '#00c806',
  sell: '#ff5252',
};

export function TimeBasedTrades({
  timePeriod,
  summary,
  trades,
  symbol
}: TimeBasedTradesProps) {
  const styles = {
    container: {
      backgroundColor: colors.bgCard,
      borderRadius: '12px',
      border: `1px solid ${colors.border}`,
      overflow: 'hidden',
      marginTop: '8px',
      marginBottom: '8px',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      backgroundColor: colors.bgHeader,
      borderBottom: `1px solid ${colors.border}`,
    },
    headerTitle: {
      fontSize: '14px',
      fontWeight: 600,
      color: colors.textPrimary,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    headerBadge: {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      fontSize: '12px',
      color: colors.textSecondary,
      backgroundColor: colors.bgCard,
      padding: '4px 8px',
      borderRadius: '4px',
    },
    statsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '1px',
      backgroundColor: colors.border,
      borderBottom: `1px solid ${colors.border}`,
    },
    statBox: {
      backgroundColor: colors.bgCard,
      padding: '12px 16px',
      textAlign: 'center' as const,
    },
    statLabel: {
      fontSize: '11px',
      color: colors.textMuted,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
      marginBottom: '4px',
    },
    statValue: {
      fontSize: '18px',
      fontWeight: 700,
      color: colors.textPrimary,
    },
    statValueSmall: {
      fontSize: '14px',
      fontWeight: 600,
      color: colors.textPrimary,
    },
    statValueAccent: {
      fontSize: '16px',
      fontWeight: 600,
      color: colors.accent,
    },
    tradesPreview: {
      padding: '12px 16px',
    },
    tradeRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 12px',
      backgroundColor: colors.bgHeader,
      borderRadius: '8px',
      marginBottom: '8px',
    },
    tradeLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },
    tradeBadge: {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      fontSize: '12px',
      fontWeight: 600,
      padding: '4px 8px',
      borderRadius: '4px',
    },
    buyBadge: {
      backgroundColor: 'rgba(0, 200, 6, 0.15)',
      color: colors.buy,
    },
    sellBadge: {
      backgroundColor: 'rgba(255, 82, 82, 0.15)',
      color: colors.sell,
    },
    tradeSymbol: {
      fontSize: '14px',
      fontWeight: 500,
      color: colors.textPrimary,
    },
    tradeType: {
      fontSize: '11px',
      color: colors.textMuted,
      textTransform: 'uppercase' as const,
    },
    tradeRight: {
      textAlign: 'right' as const,
    },
    tradeAmount: {
      fontSize: '14px',
      fontWeight: 500,
    },
    tradeDate: {
      fontSize: '12px',
      color: colors.textSecondary,
    },
    moreIndicator: {
      textAlign: 'center' as const,
      padding: '8px',
      color: colors.textMuted,
      fontSize: '12px',
    },
    dateRangeFooter: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      padding: '10px 16px',
      backgroundColor: colors.bgHeader,
      borderTop: `1px solid ${colors.border}`,
      fontSize: '12px',
      color: colors.textSecondary,
    },
  };

  // Get the first 5 trades for preview
  const previewTrades = trades.slice(0, 5);
  const remainingCount = trades.length - previewTrades.length;

  // Title based on symbol and time period
  const title = symbol
    ? `${symbol} Trades - ${timePeriod.description.charAt(0).toUpperCase() + timePeriod.description.slice(1)}`
    : `Portfolio Trades - ${timePeriod.description.charAt(0).toUpperCase() + timePeriod.description.slice(1)}`;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>
          <TrendingUp size={16} color={colors.accent} />
          {title}
        </span>
        <div style={styles.headerBadge}>
          <Clock size={12} />
          {timePeriod.tradingDays} trading day{timePeriod.tradingDays !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Stats Grid */}
      <div style={styles.statsGrid}>
        <div style={styles.statBox}>
          <div style={styles.statLabel}>Total Trades</div>
          <div style={styles.statValue}>{summary.totalTrades}</div>
        </div>
        <div style={styles.statBox}>
          <div style={styles.statLabel}>Stock / Option</div>
          <div style={styles.statValueSmall}>
            {summary.stockCount} / {summary.optionCount}
          </div>
        </div>
        <div style={styles.statBox}>
          <div style={styles.statLabel}>Total Value</div>
          <div style={styles.statValueAccent}>
            {formatCurrency(summary.totalValue)}
          </div>
        </div>
      </div>

      {/* Average Price if available */}
      {summary.averagePrice !== undefined && summary.averagePrice > 0 && (
        <div style={{
          padding: '10px 16px',
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}>
          <Hash size={14} color={colors.textMuted} />
          <span style={{ fontSize: '13px', color: colors.textSecondary }}>
            Average Price: <span style={{ color: colors.accent, fontWeight: 600 }}>
              {formatCurrency(summary.averagePrice)}
            </span>
          </span>
        </div>
      )}

      {/* Trades Preview */}
      {previewTrades.length > 0 && (
        <div style={styles.tradesPreview}>
          {previewTrades.map((trade, idx) => {
            const netAmount = parseFloat(trade.NetAmount || '0');
            const isBuy = trade.TradeType === 'B';
            const isStock = trade.SecurityType === 'S';

            return (
              <div
                key={trade.TradeID || idx}
                style={{
                  ...styles.tradeRow,
                  marginBottom: idx === previewTrades.length - 1 && remainingCount === 0 ? 0 : '8px',
                }}
              >
                <div style={styles.tradeLeft}>
                  <div style={{
                    ...styles.tradeBadge,
                    ...(isBuy ? styles.buyBadge : styles.sellBadge),
                  }}>
                    {isBuy ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {isBuy ? 'BUY' : 'SELL'}
                  </div>
                  <div>
                    <div style={styles.tradeSymbol}>{trade.Symbol}</div>
                    <div style={styles.tradeType}>
                      {isStock ? 'Stock' : 'Option'}
                      {isStock && trade.StockShareQty && ` · ${parseFloat(trade.StockShareQty).toLocaleString()} shares`}
                      {!isStock && trade.OptionContracts && ` · ${parseFloat(trade.OptionContracts).toLocaleString()} contracts`}
                    </div>
                  </div>
                </div>
                <div style={styles.tradeRight}>
                  <div style={{
                    ...styles.tradeAmount,
                    color: netAmount >= 0 ? colors.buy : colors.sell,
                  }}>
                    {formatCurrency(netAmount)}
                  </div>
                  <div style={styles.tradeDate}>
                    {trade.displayDate || trade.Date}
                  </div>
                </div>
              </div>
            );
          })}

          {remainingCount > 0 && (
            <div style={styles.moreIndicator}>
              +{remainingCount} more trade{remainingCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {/* Date Range Footer */}
      <div style={styles.dateRangeFooter}>
        <Calendar size={12} />
        {timePeriod.displayRange}
      </div>
    </div>
  );
}
