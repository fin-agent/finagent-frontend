'use client';

import React from 'react';
import { Banknote, Calendar, TrendingUp, TrendingDown, BarChart3, Layers } from 'lucide-react';

interface TotalPremiumCardProps {
  symbol: string;
  tradeType: 'buy' | 'sell' | 'all';
  totalPremium: number;
  totalTrades: number;
  totalContracts: number;
  timePeriod: string;
  callCount?: number;
  putCount?: number;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
};

const formatLargeCurrency = (value: number) => {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return formatCurrency(value);
};

// Terminal Luxe color palette
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
  accentDim: 'rgba(0, 200, 6, 0.15)',
  buy: '#00c806',
  sell: '#ff5252',
  call: '#4da6ff',
  put: '#ffa64d',
  cyan: '#06b6d4',
  cyanDim: 'rgba(6, 182, 212, 0.15)',
};

export function TotalPremiumCard({
  symbol,
  tradeType,
  totalPremium,
  totalTrades,
  totalContracts,
  timePeriod,
  callCount = 0,
  putCount = 0,
}: TotalPremiumCardProps) {
  const isSell = tradeType === 'sell';
  const actionLabel = isSell ? 'Collected' : tradeType === 'all' ? 'Total' : 'Paid';
  const actionVerb = isSell ? 'Selling' : tradeType === 'all' ? 'Trading' : 'Buying';
  // Calculate shares covered (1 contract = 100 shares)
  const totalShares = totalContracts * 100;
  // Per share premium (what options traders care about)
  const perSharePremium = totalShares > 0 ? totalPremium / totalShares : 0;

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
    accentBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '3px',
      background: isSell
        ? `linear-gradient(90deg, ${colors.accent}, #00ff08, ${colors.accent})`
        : `linear-gradient(90deg, ${colors.sell}, #ff7070, ${colors.sell})`,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '20px 24px',
      background: `linear-gradient(180deg, ${colors.bgHeader} 0%, ${colors.bgCard} 100%)`,
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
      background: isSell
        ? `linear-gradient(135deg, ${colors.accent} 0%, #008a04 100%)`
        : `linear-gradient(135deg, ${colors.sell} 0%, #cc4141 100%)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: isSell
        ? '0 4px 12px rgba(0, 200, 6, 0.3)'
        : '0 4px 12px rgba(255, 82, 82, 0.3)',
    },
    headerText: {
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
    },
    headerTitle: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '11px',
      fontWeight: 600,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '1px',
    },
    headerSymbol: {
      fontSize: '18px',
      fontWeight: 700,
      color: colors.textPrimary,
    },
    periodBadge: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '11px',
      fontWeight: 600,
      padding: '6px 12px',
      borderRadius: '8px',
      backgroundColor: colors.cyanDim,
      color: colors.cyan,
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    },
    heroSection: {
      padding: '40px 24px',
      textAlign: 'center',
      background: `radial-gradient(ellipse at top, ${colors.bgElevated} 0%, ${colors.bgCard} 100%)`,
      position: 'relative',
    },
    heroLabel: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '12px',
      fontWeight: 600,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: '2px',
      marginBottom: '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
    },
    heroValue: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '48px',
      fontWeight: 800,
      color: isSell ? colors.accent : colors.sell,
      lineHeight: 1,
      letterSpacing: '-2px',
      textShadow: isSell
        ? '0 0 40px rgba(0, 200, 6, 0.4)'
        : '0 0 40px rgba(255, 82, 82, 0.4)',
    },
    heroSubtext: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '13px',
      color: colors.textMuted,
      marginTop: '16px',
    },
    statsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '1px',
      backgroundColor: colors.border,
      borderTop: `1px solid ${colors.border}`,
    },
    statItem: {
      padding: '18px 12px',
      backgroundColor: colors.bgElevated,
      textAlign: 'center',
    },
    statIcon: {
      marginBottom: '8px',
    },
    statLabel: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '9px',
      fontWeight: 600,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.8px',
      marginBottom: '6px',
    },
    statValue: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '16px',
      fontWeight: 700,
      color: colors.textPrimary,
    },
    breakdown: {
      padding: '16px 24px',
      backgroundColor: colors.bgSurface,
      borderTop: `1px solid ${colors.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '24px',
    },
    breakdownItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    breakdownDot: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
    },
    breakdownLabel: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '12px',
      color: colors.textSecondary,
    },
    breakdownValue: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '13px',
      fontWeight: 600,
      color: colors.textPrimary,
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.accentBar} />

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.iconWrapper}>
            <Banknote size={22} color="#fff" strokeWidth={2} />
          </div>
          <div style={styles.headerText}>
            <span style={styles.headerTitle}>Total Premium {actionLabel}</span>
            <span style={styles.headerSymbol}>{symbol} Options</span>
          </div>
        </div>
        <div style={styles.periodBadge}>
          <Calendar size={12} />
          {timePeriod}
        </div>
      </div>

      {/* Hero Premium */}
      <div style={styles.heroSection}>
        <div style={styles.heroLabel}>
          {isSell ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          Premium {actionLabel}
        </div>
        <div style={styles.heroValue}>
          {formatLargeCurrency(totalPremium)}
        </div>
        <div style={styles.heroSubtext}>
          from {actionVerb.toLowerCase()} {totalTrades} option{totalTrades !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Stats Grid */}
      <div style={styles.statsGrid}>
        <div style={styles.statItem}>
          <div style={styles.statIcon}>
            <BarChart3 size={16} color={colors.textMuted} />
          </div>
          <div style={styles.statLabel}>Trades</div>
          <div style={styles.statValue}>{totalTrades}</div>
        </div>
        <div style={styles.statItem}>
          <div style={styles.statIcon}>
            <Layers size={16} color={colors.textMuted} />
          </div>
          <div style={styles.statLabel}>Contracts</div>
          <div style={styles.statValue}>{totalContracts}</div>
        </div>
        <div style={styles.statItem}>
          <div style={styles.statIcon}>
            <TrendingUp size={16} color={colors.textMuted} />
          </div>
          <div style={styles.statLabel}>Per Share</div>
          <div style={styles.statValue}>{formatCurrency(perSharePremium)}</div>
        </div>
        <div style={styles.statItem}>
          <div style={styles.statIcon}>
            <Banknote size={16} color={colors.textMuted} />
          </div>
          <div style={styles.statLabel}>Per Contract</div>
          <div style={styles.statValue}>
            {formatCurrency(totalContracts > 0 ? totalPremium / totalContracts : 0)}
          </div>
        </div>
      </div>

      {/* Call/Put Breakdown */}
      {(callCount > 0 || putCount > 0) && (
        <div style={styles.breakdown}>
          <div style={styles.breakdownItem}>
            <div style={{ ...styles.breakdownDot, backgroundColor: colors.call }} />
            <span style={styles.breakdownLabel}>Calls</span>
            <span style={styles.breakdownValue}>{callCount}</span>
          </div>
          <div style={styles.breakdownItem}>
            <div style={{ ...styles.breakdownDot, backgroundColor: colors.put }} />
            <span style={styles.breakdownLabel}>Puts</span>
            <span style={styles.breakdownValue}>{putCount}</span>
          </div>
        </div>
      )}
    </div>
  );
}
