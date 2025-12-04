'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Calendar, FileText } from 'lucide-react';

interface OptionStatsProps {
  symbol: string;
  year: number;
  tradeType: 'buy' | 'sell' | 'all';
  highestPremium: number;
  highestPremiumDate: string;
  highestPremiumContracts: number;
  highestPremiumStrike: number;
  highestPremiumCallPut: 'Call' | 'Put';
  lowestPremium: number;
  lowestPremiumDate: string;
  lowestPremiumContracts: number;
  lowestPremiumStrike: number;
  lowestPremiumCallPut: 'Call' | 'Put';
  averagePremium: number;
  totalTrades: number;
  totalContracts: number;
  totalValue: number;
  callCount: number;
  putCount: number;
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
  call: '#00c806',
  put: '#ff5252',
  option: '#8b5cf6', // Purple for options
};

export function OptionStats({
  symbol,
  year,
  tradeType,
  highestPremium,
  highestPremiumDate,
  highestPremiumContracts,
  highestPremiumStrike,
  highestPremiumCallPut,
  lowestPremium,
  lowestPremiumDate,
  lowestPremiumContracts,
  lowestPremiumStrike,
  lowestPremiumCallPut,
  averagePremium,
  totalTrades,
  totalContracts,
  totalValue,
  callCount,
  putCount,
}: OptionStatsProps) {
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
      backgroundColor: 'rgba(139, 92, 246, 0.15)',
      color: colors.option,
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
    optionTag: {
      fontSize: '10px',
      fontWeight: 600,
      padding: '2px 6px',
      borderRadius: '3px',
      marginLeft: '6px',
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
        <span style={styles.headerTitle}>{symbol} Option {typeLabel} Stats ({year})</span>
        <span style={styles.badge}>Options</span>
      </div>

      {/* Stats Content */}
      <div style={styles.content}>
        <div style={styles.statsGrid}>
          {/* Highest Premium */}
          <div style={styles.statCard}>
            <div style={styles.statLabel}>
              <TrendingUp size={12} color={colors.high} />
              Highest {actionLabel}
            </div>
            <div style={{ ...styles.statValue, color: colors.high }}>
              {formatCurrency(highestPremium)}
            </div>
            <div style={styles.statMeta}>
              <span style={{
                ...styles.optionTag,
                backgroundColor: highestPremiumCallPut === 'Call' ? 'rgba(0, 200, 6, 0.15)' : 'rgba(255, 82, 82, 0.15)',
                color: highestPremiumCallPut === 'Call' ? colors.call : colors.put,
              }}>
                {highestPremiumCallPut}
              </span>
              <span style={{ marginLeft: '6px' }}>${highestPremiumStrike} strike</span>
            </div>
            <div style={{ ...styles.statMeta, marginTop: '4px' }}>
              <Calendar size={10} style={{ display: 'inline', marginRight: '4px' }} />
              {formatDate(highestPremiumDate)}
              <span style={{ marginLeft: '8px' }}>
                <FileText size={10} style={{ display: 'inline', marginRight: '2px' }} />
                {highestPremiumContracts} contracts
              </span>
            </div>
          </div>

          {/* Lowest Premium */}
          <div style={styles.statCard}>
            <div style={styles.statLabel}>
              <TrendingDown size={12} color={colors.low} />
              Lowest {actionLabel}
            </div>
            <div style={{ ...styles.statValue, color: colors.low }}>
              {formatCurrency(lowestPremium)}
            </div>
            <div style={styles.statMeta}>
              <span style={{
                ...styles.optionTag,
                backgroundColor: lowestPremiumCallPut === 'Call' ? 'rgba(0, 200, 6, 0.15)' : 'rgba(255, 82, 82, 0.15)',
                color: lowestPremiumCallPut === 'Call' ? colors.call : colors.put,
              }}>
                {lowestPremiumCallPut}
              </span>
              <span style={{ marginLeft: '6px' }}>${lowestPremiumStrike} strike</span>
            </div>
            <div style={{ ...styles.statMeta, marginTop: '4px' }}>
              <Calendar size={10} style={{ display: 'inline', marginRight: '4px' }} />
              {formatDate(lowestPremiumDate)}
              <span style={{ marginLeft: '8px' }}>
                <FileText size={10} style={{ display: 'inline', marginRight: '2px' }} />
                {lowestPremiumContracts} contracts
              </span>
            </div>
          </div>
        </div>

        {/* Average Premium */}
        <div style={{ ...styles.statCard, marginTop: '16px' }}>
          <div style={styles.statLabel}>Average Premium</div>
          <div style={styles.statValue}>{formatCurrency(averagePremium)}</div>
        </div>
      </div>

      {/* Footer Stats */}
      <div style={styles.footer}>
        <div style={styles.footerStat}>
          <div style={styles.footerLabel}>Trades</div>
          <div style={styles.footerValue}>{totalTrades}</div>
        </div>
        <div style={styles.footerStat}>
          <div style={styles.footerLabel}>Contracts</div>
          <div style={styles.footerValue}>{totalContracts.toLocaleString()}</div>
        </div>
        <div style={styles.footerStat}>
          <div style={styles.footerLabel}>Calls/Puts</div>
          <div style={styles.footerValue}>
            <span style={{ color: colors.call }}>{callCount}</span>
            {' / '}
            <span style={{ color: colors.put }}>{putCount}</span>
          </div>
        </div>
        <div style={styles.footerStat}>
          <div style={styles.footerLabel}>Total Value</div>
          <div style={styles.footerValue}>{formatCurrency(totalValue)}</div>
        </div>
      </div>
    </div>
  );
}
