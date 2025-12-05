'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Calendar, Hash, DollarSign } from 'lucide-react';

interface TimePeriodStatsProps {
  symbol: string;
  timePeriod: string; // "last month", "last week", etc.
  tradeType: 'buy' | 'sell' | 'all';
  highestPrice: number;
  highestPriceDate: string;
  highestPriceShares: number;
  lowestPrice: number;
  lowestPriceDate: string;
  lowestPriceShares: number;
  averagePrice: number;
  totalTrades: number;
  totalShares: number;
  totalValue: number;
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
  });
};

// Colors matching the app theme
const colors = {
  bgCard: '#1a1a1a',
  bgHeader: '#252525',
  border: '#333333',
  textPrimary: '#ffffff',
  textSecondary: '#999999',
  textMuted: '#666666',
  accent: '#00c806',
  high: '#00c806',
  low: '#ff5252',
  blue: '#3b82f6',
};

export function TimePeriodStats({
  symbol,
  timePeriod,
  tradeType,
  highestPrice,
  highestPriceDate,
  highestPriceShares,
  lowestPrice,
  lowestPriceDate,
  lowestPriceShares,
  averagePrice,
  totalTrades,
  totalShares,
}: TimePeriodStatsProps) {
  const typeLabel = tradeType === 'sell' ? 'Sell' : tradeType === 'buy' ? 'Buy' : 'Trade';
  const actionLabel = tradeType === 'sell' ? 'Sold' : tradeType === 'buy' ? 'Bought' : 'Traded';

  // Format time period for display (capitalize first letter of each word)
  const formatTimePeriod = (period: string) => {
    return period.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

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
    },
    badge: {
      fontSize: '11px',
      fontWeight: 600,
      padding: '4px 8px',
      borderRadius: '4px',
      backgroundColor: tradeType === 'sell' ? 'rgba(255, 82, 82, 0.15)' : 'rgba(0, 200, 6, 0.15)',
      color: tradeType === 'sell' ? colors.low : colors.high,
    },
    content: {
      padding: '16px',
    },
    mainStat: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px',
      borderRadius: '8px',
      backgroundColor: colors.bgHeader,
      marginBottom: '12px',
    },
    mainStatLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },
    mainStatIcon: {
      width: '40px',
      height: '40px',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    mainStatValue: {
      fontSize: '24px',
      fontWeight: 700,
      color: colors.textPrimary,
    },
    mainStatLabel: {
      fontSize: '12px',
      color: colors.textSecondary,
      marginTop: '2px',
    },
    mainStatMeta: {
      textAlign: 'right' as const,
    },
    statsRow: {
      display: 'flex',
      gap: '12px',
    },
    statCard: {
      flex: 1,
      padding: '12px',
      borderRadius: '8px',
      backgroundColor: colors.bgHeader,
    },
    statLabel: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      fontSize: '11px',
      fontWeight: 600,
      color: colors.textMuted,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
      marginBottom: '6px',
    },
    statValue: {
      fontSize: '18px',
      fontWeight: 700,
      color: colors.textPrimary,
    },
    statMeta: {
      fontSize: '11px',
      color: colors.textSecondary,
      marginTop: '4px',
    },
    footer: {
      display: 'flex',
      justifyContent: 'space-around',
      padding: '12px 16px',
      borderTop: `1px solid ${colors.border}`,
      backgroundColor: colors.bgHeader,
    },
    footerStat: {
      textAlign: 'center' as const,
    },
    footerLabel: {
      fontSize: '10px',
      fontWeight: 600,
      color: colors.textMuted,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
    },
    footerValue: {
      fontSize: '14px',
      fontWeight: 600,
      color: colors.textPrimary,
      marginTop: '2px',
    },
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>{symbol} {typeLabel} Prices - {formatTimePeriod(timePeriod)}</span>
        <span style={styles.badge}>{formatTimePeriod(timePeriod)}</span>
      </div>

      {/* Stats Content */}
      <div style={styles.content}>
        {/* Average Price - Main Stat */}
        <div style={styles.mainStat}>
          <div style={styles.mainStatLeft}>
            <div style={{ ...styles.mainStatIcon, backgroundColor: 'rgba(59, 130, 246, 0.15)' }}>
              <DollarSign size={20} color={colors.blue} />
            </div>
            <div>
              <div style={styles.mainStatValue}>{formatCurrency(averagePrice)}</div>
              <div style={styles.mainStatLabel}>Average {typeLabel} Price</div>
            </div>
          </div>
          <div style={styles.mainStatMeta}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary }}>{totalTrades}</div>
            <div style={{ fontSize: '11px', color: colors.textSecondary }}>trades</div>
          </div>
        </div>

        {/* High/Low Row */}
        <div style={styles.statsRow}>
          {/* Highest Price */}
          <div style={styles.statCard}>
            <div style={styles.statLabel}>
              <TrendingUp size={12} color={colors.high} />
              Highest {actionLabel}
            </div>
            <div style={{ ...styles.statValue, color: colors.high }}>
              {formatCurrency(highestPrice)}
            </div>
            <div style={styles.statMeta}>
              <Calendar size={10} style={{ display: 'inline', marginRight: '4px' }} />
              {formatDate(highestPriceDate)}
              <span style={{ marginLeft: '6px' }}>
                <Hash size={10} style={{ display: 'inline', marginRight: '2px' }} />
                {highestPriceShares}
              </span>
            </div>
          </div>

          {/* Lowest Price */}
          <div style={styles.statCard}>
            <div style={styles.statLabel}>
              <TrendingDown size={12} color={colors.low} />
              Lowest {actionLabel}
            </div>
            <div style={{ ...styles.statValue, color: colors.low }}>
              {formatCurrency(lowestPrice)}
            </div>
            <div style={styles.statMeta}>
              <Calendar size={10} style={{ display: 'inline', marginRight: '4px' }} />
              {formatDate(lowestPriceDate)}
              <span style={{ marginLeft: '6px' }}>
                <Hash size={10} style={{ display: 'inline', marginRight: '2px' }} />
                {lowestPriceShares}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <div style={styles.footerStat}>
          <div style={styles.footerLabel}>Total Trades</div>
          <div style={styles.footerValue}>{totalTrades}</div>
        </div>
        <div style={styles.footerStat}>
          <div style={styles.footerLabel}>Total Shares</div>
          <div style={styles.footerValue}>{totalShares.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}
