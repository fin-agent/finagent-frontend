'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Calendar, DollarSign } from 'lucide-react';

interface Trade {
  securityType: string;
  buyDate: string;
  sellDate: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  profitLoss: number;
}

interface ProfitableTradesProps {
  symbol: string;
  totalProfitableTrades: number;
  totalProfit: number;
  trades: Trade[];
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
  profit: '#00c806',
  loss: '#ff5252',
};

export function ProfitableTrades({
  symbol,
  totalProfitableTrades,
  totalProfit,
  trades,
}: ProfitableTradesProps) {
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
      backgroundColor: 'rgba(0, 200, 6, 0.15)',
      color: colors.profit,
    },
    content: {
      padding: '16px',
    },
    summaryGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '16px',
      marginBottom: '16px',
    },
    summaryCard: {
      padding: '12px',
      borderRadius: '8px',
      backgroundColor: colors.bgHeader,
    },
    summaryLabel: {
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
    summaryValue: {
      fontSize: '20px',
      fontWeight: 700,
      color: colors.profit,
    },
    tradesSection: {
      marginTop: '8px',
    },
    tradesHeader: {
      fontSize: '12px',
      fontWeight: 600,
      color: colors.textMuted,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
      marginBottom: '12px',
    },
    tradeItem: {
      padding: '12px',
      borderRadius: '8px',
      backgroundColor: colors.bgHeader,
      marginBottom: '8px',
    },
    tradeHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '8px',
    },
    tradeType: {
      fontSize: '12px',
      fontWeight: 600,
      color: colors.textSecondary,
    },
    tradeProfit: {
      fontSize: '14px',
      fontWeight: 700,
    },
    tradeDetails: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '8px',
    },
    tradeDetail: {
      fontSize: '12px',
      color: colors.textSecondary,
    },
    tradeDetailLabel: {
      color: colors.textMuted,
      marginRight: '4px',
    },
    footer: {
      display: 'flex',
      justifyContent: 'center',
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
        <span style={styles.headerTitle}>{symbol} Profitable Trades</span>
        <span style={styles.badge}>
          <TrendingUp size={10} style={{ marginRight: '4px', display: 'inline' }} />
          Profit
        </span>
      </div>

      {/* Summary */}
      <div style={styles.content}>
        <div style={styles.summaryGrid}>
          {/* Total Profit */}
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>
              <DollarSign size={12} color={colors.profit} />
              Total Profit
            </div>
            <div style={styles.summaryValue}>
              {formatCurrency(totalProfit)}
            </div>
          </div>

          {/* Profitable Trades Count */}
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>
              <TrendingUp size={12} color={colors.profit} />
              Profitable Trades
            </div>
            <div style={{ ...styles.summaryValue, color: colors.textPrimary }}>
              {totalProfitableTrades}
            </div>
          </div>
        </div>

        {/* Individual Trades */}
        {trades.length > 0 && (
          <div style={styles.tradesSection}>
            <div style={styles.tradesHeader}>Trade Details</div>
            {trades.slice(0, 3).map((trade, index) => (
              <div key={index} style={styles.tradeItem}>
                <div style={styles.tradeHeader}>
                  <span style={styles.tradeType}>
                    {trade.securityType} Trade
                  </span>
                  <span style={{
                    ...styles.tradeProfit,
                    color: trade.profitLoss >= 0 ? colors.profit : colors.loss,
                  }}>
                    {trade.profitLoss >= 0 ? '+' : ''}{formatCurrency(trade.profitLoss)}
                  </span>
                </div>
                <div style={styles.tradeDetails}>
                  <div style={styles.tradeDetail}>
                    <span style={styles.tradeDetailLabel}>Buy:</span>
                    {formatDate(trade.buyDate)} @ {formatCurrency(trade.buyPrice)}
                  </div>
                  <div style={styles.tradeDetail}>
                    <span style={styles.tradeDetailLabel}>Sell:</span>
                    {formatDate(trade.sellDate)} @ {formatCurrency(trade.sellPrice)}
                  </div>
                </div>
                <div style={{ ...styles.tradeDetail, marginTop: '4px' }}>
                  <Calendar size={10} style={{ display: 'inline', marginRight: '4px' }} />
                  {trade.quantity} {trade.securityType === 'Stock' ? 'shares' : 'contracts'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <div style={styles.footerStat}>
          <div style={styles.footerLabel}>Average Profit per Trade</div>
          <div style={{ ...styles.footerValue, color: colors.profit }}>
            {formatCurrency(totalProfitableTrades > 0 ? totalProfit / totalProfitableTrades : 0)}
          </div>
        </div>
      </div>
    </div>
  );
}
