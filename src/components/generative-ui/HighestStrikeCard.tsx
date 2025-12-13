'use client';

import React from 'react';
import { Target, Calendar, FileText, DollarSign, TrendingUp, Award } from 'lucide-react';

interface HighestStrikeCardProps {
  symbol: string;
  strike: number;
  callPut: 'Call' | 'Put';
  tradeType: 'buy' | 'sell';
  date: string;
  expiration: string;
  contracts: number;
  premium: number;
  isHighest?: boolean; // true for highest, false for lowest
  datePreformatted?: boolean; // If true, dates are already formatted (from agent text parsing)
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
  gold: '#ffd700',
  goldDim: 'rgba(255, 215, 0, 0.15)',
  buy: '#00c806',
  sell: '#ff5252',
  call: '#4da6ff',
  put: '#ffa64d',
};

export function HighestStrikeCard({
  symbol,
  strike,
  callPut,
  tradeType,
  date,
  expiration,
  contracts,
  premium,
  isHighest = true,
  datePreformatted = false,
}: HighestStrikeCardProps) {
  // Format dates - if preformatted (from agent text parsing), use as-is to ensure UI matches agent speech
  const displayDate = datePreformatted ? date : formatDate(date);
  const displayExpiration = datePreformatted ? expiration : formatDate(expiration);
  const actionLabel = tradeType === 'sell' ? 'Sold' : 'Bought';
  const directionLabel = isHighest ? 'Highest' : 'Lowest';
  const isCall = callPut === 'Call';
  const isSell = tradeType === 'sell';

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
      height: '2px',
      background: isHighest
        ? `linear-gradient(90deg, ${colors.gold}, #ffed4a, ${colors.gold})`
        : `linear-gradient(90deg, ${colors.accent}, #00ff08, ${colors.accent})`,
      boxShadow: isHighest
        ? '0 0 20px rgba(255, 215, 0, 0.5)'
        : '0 0 20px rgba(0, 200, 6, 0.5)',
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
    trophy: {
      width: '48px',
      height: '48px',
      borderRadius: '14px',
      background: isHighest
        ? `linear-gradient(135deg, ${colors.gold} 0%, #b8860b 100%)`
        : `linear-gradient(135deg, ${colors.accent} 0%, #008a04 100%)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: isHighest
        ? '0 4px 16px rgba(255, 215, 0, 0.4)'
        : '0 4px 16px rgba(0, 200, 6, 0.4)',
    },
    headerTitle: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '13px',
      fontWeight: 600,
      color: isHighest ? colors.gold : colors.accent,
      textTransform: 'uppercase',
      letterSpacing: '1px',
      marginBottom: '4px',
    },
    headerSymbol: {
      fontSize: '20px',
      fontWeight: 700,
      color: colors.textPrimary,
      letterSpacing: '-0.5px',
    },
    badgeGroup: {
      display: 'flex',
      gap: '8px',
    },
    badge: {
      fontSize: '11px',
      fontWeight: 600,
      padding: '6px 12px',
      borderRadius: '8px',
      letterSpacing: '0.3px',
    },
    strikeSection: {
      padding: '32px 24px',
      textAlign: 'center',
      background: `radial-gradient(ellipse at center, ${colors.bgElevated} 0%, ${colors.bgCard} 100%)`,
    },
    strikeLabel: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '11px',
      fontWeight: 600,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '1.5px',
      marginBottom: '12px',
    },
    strikeValue: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '56px',
      fontWeight: 800,
      color: colors.textPrimary,
      lineHeight: 1,
      letterSpacing: '-2px',
      textShadow: '0 4px 24px rgba(0, 0, 0, 0.5)',
    },
    strikeCurrency: {
      fontSize: '32px',
      fontWeight: 600,
      color: colors.textSecondary,
      marginRight: '4px',
    },
    detailsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '1px',
      backgroundColor: colors.border,
    },
    detailItem: {
      padding: '16px 20px',
      backgroundColor: colors.bgElevated,
    },
    detailIcon: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '8px',
    },
    detailLabel: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '10px',
      fontWeight: 600,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.8px',
    },
    detailValue: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '15px',
      fontWeight: 600,
      color: colors.textPrimary,
    },
    premiumSection: {
      padding: '20px 24px',
      backgroundColor: colors.bgSurface,
      borderTop: `1px solid ${colors.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    premiumLabel: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '12px',
      fontWeight: 600,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    },
    premiumValue: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '24px',
      fontWeight: 700,
      color: isSell ? colors.buy : colors.sell,
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.glowAccent} />

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.trophy}>
            {isHighest ? (
              <Award size={24} color="#000" strokeWidth={2.5} />
            ) : (
              <TrendingUp size={24} color="#000" strokeWidth={2.5} />
            )}
          </div>
          <div>
            <div style={styles.headerTitle}>{directionLabel} Strike {actionLabel}</div>
            <div style={styles.headerSymbol}>{symbol}</div>
          </div>
        </div>
        <div style={styles.badgeGroup}>
          <span style={{
            ...styles.badge,
            backgroundColor: isCall ? 'rgba(77, 166, 255, 0.15)' : 'rgba(255, 166, 77, 0.15)',
            color: isCall ? colors.call : colors.put,
          }}>
            {callPut}
          </span>
          <span style={{
            ...styles.badge,
            backgroundColor: isSell ? 'rgba(255, 82, 82, 0.15)' : colors.accentDim,
            color: isSell ? colors.sell : colors.buy,
          }}>
            {actionLabel}
          </span>
        </div>
      </div>

      {/* Strike Price Hero */}
      <div style={styles.strikeSection}>
        <div style={styles.strikeLabel}>Strike Price</div>
        <div style={styles.strikeValue}>
          <span style={styles.strikeCurrency}>$</span>
          {strike.toLocaleString()}
        </div>
      </div>

      {/* Details Grid */}
      <div style={styles.detailsGrid}>
        <div style={styles.detailItem}>
          <div style={styles.detailIcon}>
            <Calendar size={14} color={colors.textMuted} />
            <span style={styles.detailLabel}>Trade Date</span>
          </div>
          <div style={styles.detailValue}>{displayDate}</div>
        </div>
        <div style={styles.detailItem}>
          <div style={styles.detailIcon}>
            <Target size={14} color={colors.textMuted} />
            <span style={styles.detailLabel}>Expiration</span>
          </div>
          <div style={styles.detailValue}>{displayExpiration}</div>
        </div>
        <div style={styles.detailItem}>
          <div style={styles.detailIcon}>
            <FileText size={14} color={colors.textMuted} />
            <span style={styles.detailLabel}>Contracts</span>
          </div>
          <div style={styles.detailValue}>{contracts}</div>
        </div>
        <div style={styles.detailItem}>
          <div style={styles.detailIcon}>
            <DollarSign size={14} color={colors.textMuted} />
            <span style={styles.detailLabel}>Per Contract</span>
          </div>
          <div style={styles.detailValue}>
            {formatCurrency(contracts > 0 ? premium / contracts : premium)}
          </div>
        </div>
      </div>

      {/* Premium Footer */}
      <div style={styles.premiumSection}>
        <span style={styles.premiumLabel}>
          Total Premium {isSell ? 'Collected' : 'Paid'}
        </span>
        <span style={styles.premiumValue}>{formatCurrency(premium)}</span>
      </div>
    </div>
  );
}
