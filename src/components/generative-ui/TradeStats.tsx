'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Calendar, Hash } from 'lucide-react';

interface TradeStatsProps {
  symbol: string;
  year: number;
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
    year: 'numeric'
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
};

export function TradeStats({
  symbol,
  year,
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
  totalValue,
}: TradeStatsProps) {
  const typeLabel = tradeType === 'sell' ? 'Sell' : tradeType === 'buy' ? 'Buy' : 'All';
  const actionLabel = tradeType === 'sell' ? 'Sold' : tradeType === 'buy' ? 'Bought' : 'Traded';

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
    statsGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '16px',
    },
    statCard: {
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
      marginBottom: '8px',
    },
    statValue: {
      fontSize: '20px',
      fontWeight: 700,
      color: colors.textPrimary,
      marginBottom: '4px',
    },
    statMeta: {
      fontSize: '12px',
      color: colors.textSecondary,
    },
    footer: {
      display: 'flex',
      justifyContent: 'space-between',
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
        <span style={styles.headerTitle}>{symbol} {typeLabel} Stats ({year})</span>
        <span style={styles.badge}>{typeLabel}</span>
      </div>

      {/* Stats Content */}
      <div style={styles.content}>
        <div style={styles.statsGrid}>
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
              <span style={{ marginLeft: '8px' }}>
                <Hash size={10} style={{ display: 'inline', marginRight: '2px' }} />
                {highestPriceShares} shares
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
              <span style={{ marginLeft: '8px' }}>
                <Hash size={10} style={{ display: 'inline', marginRight: '2px' }} />
                {lowestPriceShares} shares
              </span>
            </div>
          </div>
        </div>

        {/* Average Price */}
        <div style={{ ...styles.statCard, marginTop: '16px' }}>
          <div style={styles.statLabel}>Average Price</div>
          <div style={styles.statValue}>{formatCurrency(averagePrice)}</div>
        </div>
      </div>

      {/* Footer Stats */}
      <div style={styles.footer}>
        <div style={styles.footerStat}>
          <div style={styles.footerLabel}>Trades</div>
          <div style={styles.footerValue}>{totalTrades}</div>
        </div>
        <div style={styles.footerStat}>
          <div style={styles.footerLabel}>Shares</div>
          <div style={styles.footerValue}>{totalShares.toLocaleString()}</div>
        </div>
        <div style={styles.footerStat}>
          <div style={styles.footerLabel}>Total Value</div>
          <div style={styles.footerValue}>{formatCurrency(totalValue)}</div>
        </div>
      </div>
    </div>
  );
}
