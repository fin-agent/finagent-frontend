'use client';

import React from 'react';
import { Clock, Calendar, Target, DollarSign, Layers, TrendingUp, TrendingDown } from 'lucide-react';

interface LastOptionTradeCardProps {
  symbol: string;
  callPut: 'Call' | 'Put';
  tradeType: 'buy' | 'sell';
  strike: number;
  expiration: string;
  tradeDate: string;
  contracts: number;
  premium: number;
  totalValue: number;
  totalTrades?: number;
  avgPremium?: number;
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
    year: 'numeric'
  });
};

// Terminal Luxe color palette with cyan accent for "recent/time" theme
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
  cyan: '#06b6d4',
  cyanDim: 'rgba(6, 182, 212, 0.15)',
  cyanGlow: 'rgba(6, 182, 212, 0.4)',
  buy: '#00c806',
  sell: '#ff5252',
  call: '#4da6ff',
  put: '#ffa64d',
};

export function LastOptionTradeCard({
  symbol,
  callPut,
  tradeType,
  strike,
  expiration,
  tradeDate,
  contracts,
  premium,
  totalValue,
  totalTrades,
  avgPremium,
}: LastOptionTradeCardProps) {
  const isBuy = tradeType === 'buy';
  const isCall = callPut === 'Call';
  const actionLabel = isBuy ? 'Bought' : 'Sold';

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
    glowAccent: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '3px',
      background: `linear-gradient(90deg, ${colors.cyan}, #22d3ee, ${colors.cyan})`,
      boxShadow: `0 0 20px ${colors.cyanGlow}`,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '20px 24px',
      background: `linear-gradient(135deg, ${colors.bgHeader} 0%, ${colors.bgElevated} 100%)`,
      borderBottom: `1px solid ${colors.border}`,
    },
    headerLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
    },
    iconContainer: {
      width: '52px',
      height: '52px',
      borderRadius: '14px',
      background: `linear-gradient(135deg, ${colors.cyan} 0%, #0891b2 100%)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: `0 4px 16px ${colors.cyanGlow}`,
    },
    headerText: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '4px',
    },
    title: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '16px',
      fontWeight: 600,
      color: colors.textPrimary,
      letterSpacing: '-0.3px',
    },
    subtitle: {
      fontSize: '13px',
      color: colors.textMuted,
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    },
    badges: {
      display: 'flex',
      gap: '8px',
    },
    badge: {
      padding: '6px 12px',
      borderRadius: '8px',
      fontSize: '12px',
      fontWeight: 600,
      fontFamily: '"JetBrains Mono", monospace',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
    },
    buyBadge: {
      backgroundColor: 'rgba(0, 200, 6, 0.15)',
      color: colors.buy,
      border: '1px solid rgba(0, 200, 6, 0.3)',
    },
    sellBadge: {
      backgroundColor: 'rgba(255, 82, 82, 0.15)',
      color: colors.sell,
      border: '1px solid rgba(255, 82, 82, 0.3)',
    },
    callBadge: {
      backgroundColor: 'rgba(77, 166, 255, 0.15)',
      color: colors.call,
      border: '1px solid rgba(77, 166, 255, 0.3)',
    },
    putBadge: {
      backgroundColor: 'rgba(255, 166, 77, 0.15)',
      color: colors.put,
      border: '1px solid rgba(255, 166, 77, 0.3)',
    },
    heroSection: {
      padding: '32px 24px',
      background: `linear-gradient(180deg, ${colors.cyanDim} 0%, transparent 100%)`,
      textAlign: 'center' as const,
      borderBottom: `1px solid ${colors.border}`,
    },
    heroLabel: {
      fontSize: '12px',
      color: colors.textMuted,
      textTransform: 'uppercase' as const,
      letterSpacing: '1.5px',
      marginBottom: '8px',
      fontFamily: '"JetBrains Mono", monospace',
    },
    heroSymbol: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '36px',
      fontWeight: 700,
      color: colors.textPrimary,
      letterSpacing: '-1px',
      marginBottom: '4px',
    },
    heroStrike: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '28px',
      fontWeight: 600,
      color: colors.cyan,
      textShadow: `0 0 30px ${colors.cyanGlow}`,
    },
    heroSubtext: {
      fontSize: '14px',
      color: colors.textSecondary,
      marginTop: '12px',
    },
    detailsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '1px',
      backgroundColor: colors.border,
    },
    detailItem: {
      backgroundColor: colors.bgCard,
      padding: '20px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '8px',
    },
    detailLabel: {
      fontSize: '11px',
      color: colors.textMuted,
      textTransform: 'uppercase' as const,
      letterSpacing: '1px',
      fontFamily: '"JetBrains Mono", monospace',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    },
    detailValue: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '16px',
      fontWeight: 600,
      color: colors.textPrimary,
    },
    totalSection: {
      padding: '20px 24px',
      background: `linear-gradient(135deg, ${colors.bgElevated} 0%, ${colors.bgCard} 100%)`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTop: `1px solid ${colors.border}`,
    },
    totalLabel: {
      fontSize: '13px',
      color: colors.textSecondary,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    totalValue: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '22px',
      fontWeight: 700,
      color: isBuy ? colors.sell : colors.buy,
    },
    summaryBar: {
      padding: '16px 24px',
      backgroundColor: colors.bgElevated,
      display: 'flex',
      justifyContent: 'center',
      gap: '24px',
      borderTop: `1px solid ${colors.border}`,
    },
    summaryItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '13px',
      color: colors.textSecondary,
    },
    summaryValue: {
      fontFamily: '"JetBrains Mono", monospace',
      fontWeight: 600,
      color: colors.textPrimary,
    },
  };

  return (
    <div style={styles.container}>
      {/* Cyan glow accent for "recent" theme */}
      <div style={styles.glowAccent} />

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.iconContainer}>
            <Clock size={26} color="#fff" strokeWidth={2.5} />
          </div>
          <div style={styles.headerText}>
            <div style={styles.title}>Most Recent {callPut} Option</div>
            <div style={styles.subtitle}>
              <Calendar size={12} />
              {formatDate(tradeDate)}
            </div>
          </div>
        </div>
        <div style={styles.badges}>
          <span style={{
            ...styles.badge,
            ...(isBuy ? styles.buyBadge : styles.sellBadge),
          }}>
            {actionLabel}
          </span>
          <span style={{
            ...styles.badge,
            ...(isCall ? styles.callBadge : styles.putBadge),
          }}>
            {callPut}
          </span>
        </div>
      </div>

      {/* Hero Section - Symbol & Strike */}
      <div style={styles.heroSection}>
        <div style={styles.heroLabel}>Latest Trade</div>
        <div style={styles.heroSymbol}>{symbol}</div>
        <div style={styles.heroStrike}>${strike.toFixed(2)} Strike</div>
        <div style={styles.heroSubtext}>
          {actionLabel} {contracts} contract{contracts !== 1 ? 's' : ''} @ {formatCurrency(premium)}/share
        </div>
      </div>

      {/* Details Grid */}
      <div style={styles.detailsGrid}>
        <div style={styles.detailItem}>
          <div style={styles.detailLabel}>
            <Calendar size={12} color={colors.cyan} />
            Expiration
          </div>
          <div style={styles.detailValue}>{formatDate(expiration)}</div>
        </div>
        <div style={styles.detailItem}>
          <div style={styles.detailLabel}>
            <Layers size={12} color={colors.cyan} />
            Contracts
          </div>
          <div style={styles.detailValue}>{contracts}</div>
          <div style={{ fontSize: '11px', color: colors.textMuted, marginTop: '2px' }}>
            {(contracts * 100).toLocaleString()} shares
          </div>
        </div>
        <div style={styles.detailItem}>
          <div style={styles.detailLabel}>
            <Target size={12} color={colors.cyan} />
            Strike Price
          </div>
          <div style={styles.detailValue}>{formatCurrency(strike)}</div>
        </div>
        <div style={styles.detailItem}>
          <div style={styles.detailLabel}>
            <DollarSign size={12} color={colors.cyan} />
            Premium/Share
          </div>
          <div style={styles.detailValue}>{formatCurrency(premium)}</div>
          <div style={{ fontSize: '11px', color: colors.textMuted, marginTop: '2px' }}>
            {formatCurrency(premium * 100)}/contract
          </div>
        </div>
      </div>

      {/* Total Value Section */}
      <div style={styles.totalSection}>
        <div style={styles.totalLabel}>
          {isBuy ? <TrendingDown size={18} color={colors.sell} /> : <TrendingUp size={18} color={colors.buy} />}
          Total {isBuy ? 'Paid' : 'Received'}
        </div>
        <div style={styles.totalValue}>
          {isBuy ? '-' : '+'}{formatCurrency(Math.abs(totalValue))}
        </div>
      </div>

      {/* Summary Bar (if multiple trades) */}
      {totalTrades && totalTrades > 1 && (
        <div style={styles.summaryBar}>
          <div style={styles.summaryItem}>
            Total Trades: <span style={styles.summaryValue}>{totalTrades}</span>
          </div>
          {avgPremium && (
            <div style={styles.summaryItem}>
              Avg Premium: <span style={styles.summaryValue}>{formatCurrency(avgPremium)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
