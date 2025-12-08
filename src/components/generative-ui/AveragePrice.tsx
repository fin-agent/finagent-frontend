'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Calendar, Activity } from 'lucide-react';

interface AveragePriceProps {
  symbol: string;
  averagePrice: number;
  timePeriod: string; // "last month", "last week", "this year", etc.
  tradeType: 'buy' | 'sell' | 'all';
  totalTrades: number;
  totalShares?: number;
  // Optional high/low context
  highestPrice?: number;
  lowestPrice?: number;
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
  bgHeader: '#222222',
  bgAccent: '#0d1f0d',
  border: '#2a2a2a',
  borderAccent: '#1a3a1a',
  textPrimary: '#ffffff',
  textSecondary: '#a0a0a0',
  textMuted: '#666666',
  accent: '#00c806',
  accentGlow: 'rgba(0, 200, 6, 0.15)',
  buy: '#00c806',
  sell: '#ff5252',
};

export function AveragePrice({
  symbol,
  averagePrice,
  timePeriod,
  tradeType,
  totalTrades,
  totalShares,
  highestPrice,
  lowestPrice,
}: AveragePriceProps) {
  const actionLabel = tradeType === 'sell' ? 'Sold' : tradeType === 'buy' ? 'Bought' : 'Traded';
  const typeColor = tradeType === 'sell' ? colors.sell : colors.buy;

  // Format time period for display (capitalize)
  const formatTimePeriod = (period: string) => {
    return period.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const styles = {
    container: {
      backgroundColor: colors.bgCard,
      borderRadius: '16px',
      border: `1px solid ${colors.border}`,
      overflow: 'hidden',
      marginTop: '12px',
      marginBottom: '8px',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 18px',
      backgroundColor: colors.bgHeader,
      borderBottom: `1px solid ${colors.border}`,
    },
    headerLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    },
    symbolBadge: {
      fontSize: '15px',
      fontWeight: 700,
      color: colors.textPrimary,
      letterSpacing: '0.5px',
    },
    timeBadge: {
      fontSize: '11px',
      fontWeight: 600,
      padding: '4px 10px',
      borderRadius: '12px',
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
      color: colors.textSecondary,
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
    },
    typeBadge: {
      fontSize: '11px',
      fontWeight: 600,
      padding: '4px 10px',
      borderRadius: '12px',
      backgroundColor: tradeType === 'sell' ? 'rgba(255, 82, 82, 0.12)' : 'rgba(0, 200, 6, 0.12)',
      color: typeColor,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
    },
    mainContent: {
      padding: '24px 20px',
      background: `linear-gradient(135deg, ${colors.bgAccent} 0%, ${colors.bgCard} 100%)`,
      position: 'relative' as const,
    },
    glowOrb: {
      position: 'absolute' as const,
      top: '-20px',
      right: '-20px',
      width: '100px',
      height: '100px',
      borderRadius: '50%',
      background: `radial-gradient(circle, ${colors.accentGlow} 0%, transparent 70%)`,
      pointerEvents: 'none' as const,
    },
    priceLabel: {
      fontSize: '12px',
      fontWeight: 600,
      color: colors.textMuted,
      textTransform: 'uppercase' as const,
      letterSpacing: '1px',
      marginBottom: '8px',
    },
    priceRow: {
      display: 'flex',
      alignItems: 'baseline',
      gap: '8px',
    },
    priceValue: {
      fontSize: '36px',
      fontWeight: 700,
      color: colors.accent,
      letterSpacing: '-1px',
      lineHeight: 1,
    },
    priceUnit: {
      fontSize: '14px',
      fontWeight: 500,
      color: colors.textSecondary,
    },
    statsRow: {
      display: 'flex',
      gap: '16px',
      marginTop: '20px',
      paddingTop: '16px',
      borderTop: `1px solid ${colors.border}`,
    },
    statItem: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    statIcon: {
      width: '32px',
      height: '32px',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    statContent: {
      display: 'flex',
      flexDirection: 'column' as const,
    },
    statValue: {
      fontSize: '16px',
      fontWeight: 600,
      color: colors.textPrimary,
    },
    statLabel: {
      fontSize: '11px',
      color: colors.textMuted,
      marginTop: '2px',
    },
    footer: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '12px 18px',
      backgroundColor: colors.bgHeader,
      borderTop: `1px solid ${colors.border}`,
    },
    footerItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    },
    footerLabel: {
      fontSize: '11px',
      color: colors.textMuted,
    },
    footerValue: {
      fontSize: '12px',
      fontWeight: 600,
      color: colors.textSecondary,
    },
    rangeBar: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginTop: '16px',
      padding: '12px',
      borderRadius: '8px',
      backgroundColor: 'rgba(255, 255, 255, 0.03)',
    },
    rangeTrack: {
      flex: 1,
      height: '4px',
      borderRadius: '2px',
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      position: 'relative' as const,
    },
    rangeMarker: {
      position: 'absolute' as const,
      top: '-4px',
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      backgroundColor: colors.accent,
      border: `2px solid ${colors.bgCard}`,
      boxShadow: `0 0 8px ${colors.accentGlow}`,
    },
    rangeValue: {
      fontSize: '11px',
      fontWeight: 600,
      minWidth: '60px',
    },
  };

  // Calculate marker position if we have high/low
  const getMarkerPosition = () => {
    if (!highestPrice || !lowestPrice || highestPrice === lowestPrice) return 50;
    const range = highestPrice - lowestPrice;
    const position = ((averagePrice - lowestPrice) / range) * 100;
    return Math.max(5, Math.min(95, position)); // Clamp between 5-95%
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.symbolBadge}>{symbol}</span>
          <span style={styles.typeBadge}>{actionLabel}</span>
        </div>
        <span style={styles.timeBadge}>
          <Calendar size={12} />
          {formatTimePeriod(timePeriod)}
        </span>
      </div>

      {/* Main Content */}
      <div style={styles.mainContent}>
        <div style={styles.glowOrb} />

        <div style={styles.priceLabel}>Average {actionLabel} Price</div>
        <div style={styles.priceRow}>
          <span style={styles.priceValue}>{formatCurrency(averagePrice)}</span>
          <span style={styles.priceUnit}>per share</span>
        </div>

        {/* Range Visualization (if high/low provided) */}
        {highestPrice && lowestPrice && highestPrice !== lowestPrice && (
          <div style={styles.rangeBar}>
            <span style={{ ...styles.rangeValue, color: colors.sell, textAlign: 'right' as const }}>
              <TrendingDown size={10} style={{ marginRight: '4px', display: 'inline' }} />
              {formatCurrency(lowestPrice)}
            </span>
            <div style={styles.rangeTrack}>
              <div style={{ ...styles.rangeMarker, left: `calc(${getMarkerPosition()}% - 6px)` }} />
            </div>
            <span style={{ ...styles.rangeValue, color: colors.buy }}>
              <TrendingUp size={10} style={{ marginRight: '4px', display: 'inline' }} />
              {formatCurrency(highestPrice)}
            </span>
          </div>
        )}

        {/* Stats Row */}
        <div style={styles.statsRow}>
          <div style={styles.statItem}>
            <div style={styles.statIcon}>
              <Activity size={16} color={colors.textSecondary} />
            </div>
            <div style={styles.statContent}>
              <span style={styles.statValue}>{totalTrades}</span>
              <span style={styles.statLabel}>{totalTrades === 1 ? 'Trade' : 'Trades'}</span>
            </div>
          </div>
          {totalShares !== undefined && (
            <div style={styles.statItem}>
              <div style={styles.statIcon}>
                <span style={{ fontSize: '14px', color: colors.textSecondary }}>#</span>
              </div>
              <div style={styles.statContent}>
                <span style={styles.statValue}>{totalShares.toLocaleString()}</span>
                <span style={styles.statLabel}>Shares</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <div style={styles.footerItem}>
          <span style={styles.footerLabel}>Period:</span>
          <span style={styles.footerValue}>{formatTimePeriod(timePeriod)}</span>
        </div>
        <div style={styles.footerItem}>
          <span style={styles.footerLabel}>Type:</span>
          <span style={{ ...styles.footerValue, color: typeColor }}>{actionLabel}</span>
        </div>
      </div>
    </div>
  );
}
