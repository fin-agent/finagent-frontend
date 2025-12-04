'use client';

import React from 'react';
import { Download, Maximize2, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface Trade {
  TradeID: number;
  Date: string;
  Symbol: string;
  SecurityType: string;
  TradeType: string;
  StockTradePrice: string;
  StockShareQty: string;
  OptionContracts: string;
  OptionTradePremium: string;
  GrossAmount: string;
  NetAmount: string;
  Strike?: string;
  Expiration?: string;
  'Call/Put'?: string;
}

interface TradeSummary {
  totalShares: number;
  totalCost: number;
  currentValue: number;
  symbol: string;
}

interface TradesTableProps {
  trades: Trade[];
  summary: TradeSummary;
  accountCode?: string;
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

export function TradesTable({ trades, summary, accountCode = 'C40421' }: TradesTableProps) {
  const stockTrades = trades.filter(t => t.SecurityType === 'S');
  const optionTrades = trades.filter(t => t.SecurityType === 'O');
  const pnl = summary.currentValue - summary.totalCost;
  const pnlPercent = summary.totalCost > 0 ? (pnl / summary.totalCost) * 100 : 0;

  const styles = {
    container: {
      backgroundColor: colors.bgCard,
      borderRadius: '12px',
      border: `1px solid ${colors.border}`,
      overflow: 'hidden',
      marginTop: '8px',
      marginBottom: '8px',
      maxWidth: '100%',
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
    headerActions: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },
    iconButton: {
      background: 'none',
      border: 'none',
      padding: '4px',
      cursor: 'pointer',
      color: colors.textSecondary,
      display: 'flex',
      alignItems: 'center',
    },
    summarySection: {
      padding: '12px 16px',
      backgroundColor: colors.bgCard,
      borderBottom: `1px solid ${colors.border}`,
    },
    summaryText: {
      fontSize: '13px',
      color: colors.textSecondary,
      lineHeight: 1.5,
      margin: 0,
    },
    summaryValue: {
      color: colors.textPrimary,
      fontWeight: 600,
    },
    pnlBadge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: 600,
      marginTop: '8px',
    },
    tableWrapper: {
      overflowX: 'auto' as const,
      WebkitOverflowScrolling: 'touch' as const,
    },
    sectionHeader: {
      padding: '10px 16px',
      backgroundColor: colors.bgHeader,
      borderBottom: `1px solid ${colors.border}`,
      borderTop: `1px solid ${colors.border}`,
    },
    sectionTitle: {
      fontSize: '12px',
      fontWeight: 600,
      color: colors.textSecondary,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
      margin: 0,
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
      fontSize: '13px',
      minWidth: '500px',
    },
    th: {
      padding: '10px 12px',
      textAlign: 'left' as const,
      fontSize: '11px',
      fontWeight: 600,
      color: colors.textMuted,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
      borderBottom: `1px solid ${colors.border}`,
      backgroundColor: colors.bgHeader,
      whiteSpace: 'nowrap' as const,
    },
    thRight: {
      textAlign: 'right' as const,
    },
    thCenter: {
      textAlign: 'center' as const,
    },
    td: {
      padding: '10px 12px',
      borderBottom: `1px solid ${colors.border}`,
      color: colors.textPrimary,
      whiteSpace: 'nowrap' as const,
    },
    tdRight: {
      textAlign: 'right' as const,
    },
    tdCenter: {
      textAlign: 'center' as const,
    },
    rowNum: {
      color: colors.textMuted,
      fontSize: '12px',
      width: '40px',
    },
    buyBadge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '2px',
      color: colors.buy,
      fontSize: '12px',
      fontWeight: 500,
    },
    sellBadge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '2px',
      color: colors.sell,
      fontSize: '12px',
      fontWeight: 500,
    },
    positive: {
      color: colors.buy,
    },
    negative: {
      color: colors.sell,
    },
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>{summary.symbol} Trades For {accountCode}</span>
        <div style={styles.headerActions}>
          <button style={styles.iconButton} title="Download">
            <Download size={16} />
          </button>
          <button style={styles.iconButton} title="Expand">
            <Maximize2 size={16} />
          </button>
        </div>
      </div>

      {/* Summary */}
      <div style={styles.summarySection}>
        <p style={styles.summaryText}>
          <span style={styles.summaryValue}>{summary.totalShares.toLocaleString()}</span> shares purchased for{' '}
          <span style={styles.summaryValue}>{formatCurrency(summary.totalCost)}</span>
          {' '}&bull;{' '}Current value:{' '}
          <span style={styles.summaryValue}>{formatCurrency(summary.currentValue)}</span>
        </p>
        <div style={{
          ...styles.pnlBadge,
          backgroundColor: pnl >= 0 ? 'rgba(0, 200, 6, 0.15)' : 'rgba(255, 82, 82, 0.15)',
          color: pnl >= 0 ? colors.buy : colors.sell,
        }}>
          {pnl >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {formatCurrency(Math.abs(pnl))} ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
        </div>
      </div>

      {/* Stock Trades */}
      {stockTrades.length > 0 && (
        <>
          <div style={styles.sectionHeader}>
            <p style={styles.sectionTitle}>Stock Trades ({stockTrades.length})</p>
          </div>
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, ...styles.thCenter, width: '40px' }}>#</th>
                  <th style={styles.th}>Date</th>
                  <th style={{ ...styles.th, ...styles.thCenter }}>Type</th>
                  <th style={{ ...styles.th, ...styles.thRight }}>Shares</th>
                  <th style={{ ...styles.th, ...styles.thRight }}>Price</th>
                  <th style={{ ...styles.th, ...styles.thRight }}>Net Amount</th>
                </tr>
              </thead>
              <tbody>
                {stockTrades.map((trade, index) => {
                  const netAmount = parseFloat(trade.NetAmount || '0');
                  return (
                    <tr key={trade.TradeID} style={{ backgroundColor: index % 2 === 0 ? colors.bgRow : colors.bgRowAlt }}>
                      <td style={{ ...styles.td, ...styles.tdCenter, ...styles.rowNum }}>{index + 1}</td>
                      <td style={styles.td}>{formatDate(trade.Date)}</td>
                      <td style={{ ...styles.td, ...styles.tdCenter }}>
                        {trade.TradeType === 'B' ? (
                          <span style={styles.buyBadge}>
                            <ArrowUpRight size={12} /> Buy
                          </span>
                        ) : (
                          <span style={styles.sellBadge}>
                            <ArrowDownRight size={12} /> Sell
                          </span>
                        )}
                      </td>
                      <td style={{ ...styles.td, ...styles.tdRight }}>
                        {parseFloat(trade.StockShareQty || '0').toLocaleString()}
                      </td>
                      <td style={{ ...styles.td, ...styles.tdRight }}>
                        {formatCurrency(parseFloat(trade.StockTradePrice || '0'))}
                      </td>
                      <td style={{
                        ...styles.td,
                        ...styles.tdRight,
                        ...(netAmount >= 0 ? styles.positive : styles.negative),
                        fontWeight: 500,
                      }}>
                        {formatCurrency(netAmount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Option Trades */}
      {optionTrades.length > 0 && (
        <>
          <div style={styles.sectionHeader}>
            <p style={styles.sectionTitle}>Option Trades ({optionTrades.length})</p>
          </div>
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, ...styles.thCenter, width: '40px' }}>#</th>
                  <th style={styles.th}>Date</th>
                  <th style={{ ...styles.th, ...styles.thCenter }}>Type</th>
                  <th style={{ ...styles.th, ...styles.thCenter }}>C/P</th>
                  <th style={{ ...styles.th, ...styles.thRight }}>Strike</th>
                  <th style={styles.th}>Exp</th>
                  <th style={{ ...styles.th, ...styles.thRight }}>Contracts</th>
                  <th style={{ ...styles.th, ...styles.thRight }}>Net Amount</th>
                </tr>
              </thead>
              <tbody>
                {optionTrades.map((trade, index) => {
                  const netAmount = parseFloat(trade.NetAmount || '0');
                  return (
                    <tr key={trade.TradeID} style={{ backgroundColor: index % 2 === 0 ? colors.bgRow : colors.bgRowAlt }}>
                      <td style={{ ...styles.td, ...styles.tdCenter, ...styles.rowNum }}>{index + 1}</td>
                      <td style={styles.td}>{formatDate(trade.Date)}</td>
                      <td style={{ ...styles.td, ...styles.tdCenter }}>
                        {trade.TradeType === 'B' ? (
                          <span style={styles.buyBadge}>Buy</span>
                        ) : (
                          <span style={styles.sellBadge}>Sell</span>
                        )}
                      </td>
                      <td style={{ ...styles.td, ...styles.tdCenter }}>
                        <span style={{
                          color: trade['Call/Put'] === 'C' ? '#4da6ff' : '#ffa64d',
                          fontWeight: 500,
                        }}>
                          {trade['Call/Put'] === 'C' ? 'Call' : 'Put'}
                        </span>
                      </td>
                      <td style={{ ...styles.td, ...styles.tdRight }}>
                        {formatCurrency(parseFloat(trade.Strike || '0'))}
                      </td>
                      <td style={styles.td}>
                        {trade.Expiration ? formatDate(trade.Expiration) : '-'}
                      </td>
                      <td style={{ ...styles.td, ...styles.tdRight }}>
                        {parseFloat(trade.OptionContracts || '0').toLocaleString()}
                      </td>
                      <td style={{
                        ...styles.td,
                        ...styles.tdRight,
                        ...(netAmount >= 0 ? styles.positive : styles.negative),
                        fontWeight: 500,
                      }}>
                        {formatCurrency(netAmount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
