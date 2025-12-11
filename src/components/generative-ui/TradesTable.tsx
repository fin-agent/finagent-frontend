'use client';

import React, { useState, useMemo } from 'react';
import { Download, Maximize2, ArrowUpRight, ArrowDownRight, X, Filter, ChevronLeft, ChevronRight } from 'lucide-react';

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

export interface ActiveFilters {
  symbol?: string;
  securityType?: 'S' | 'O' | 'all';
  tradeType?: 'B' | 'S' | 'all';
  callPut?: 'C' | 'P' | 'all';
  fromDate?: string;
  toDate?: string;
  expiration?: string;
  strike?: number;
}

export interface Aggregations {
  tradeCount: number;
  totalPremium: number;
  avgPremium: number;
  totalQuantity: number;
  buyCount?: number;
  sellCount?: number;
  stockCount?: number;
  optionCount?: number;
  callCount?: number;
  putCount?: number;
}

interface TradesTableProps {
  trades: Trade[];
  summary?: TradeSummary | null;
  filters?: ActiveFilters;
  aggregations?: Aggregations;
  onClearFilter?: (key: keyof ActiveFilters) => void;
  pageSize?: number;
}

const ITEMS_PER_PAGE = 10;

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

// Helper to format filter labels
const formatFilterLabel = (key: string, value: unknown): string => {
  if (value === 'all' || value === undefined || value === null) return '';

  switch (key) {
    case 'symbol': return `${value}`;
    case 'securityType': return value === 'S' ? 'Stocks' : 'Options';
    case 'tradeType': return value === 'B' ? 'Buys' : 'Sells';
    case 'callPut': return value === 'C' ? 'Calls' : 'Puts';
    case 'fromDate': return `From: ${value}`;
    case 'toDate': return `To: ${value}`;
    case 'expiration': return `Exp: ${value}`;
    case 'strike': return `$${value} Strike`;
    default: return String(value);
  }
};

export function TradesTable({ trades, summary, filters, aggregations, onClearFilter, pageSize = ITEMS_PER_PAGE }: TradesTableProps) {
  const [stockPage, setStockPage] = useState(1);
  const [optionPage, setOptionPage] = useState(1);

  const stockTrades = useMemo(() => trades.filter(t => t.SecurityType === 'S'), [trades]);
  const optionTrades = useMemo(() => trades.filter(t => t.SecurityType === 'O'), [trades]);

  // Pagination calculations
  const stockTotalPages = Math.ceil(stockTrades.length / pageSize);
  const optionTotalPages = Math.ceil(optionTrades.length / pageSize);

  const paginatedStockTrades = useMemo(() => {
    const start = (stockPage - 1) * pageSize;
    return stockTrades.slice(start, start + pageSize);
  }, [stockTrades, stockPage, pageSize]);

  const paginatedOptionTrades = useMemo(() => {
    const start = (optionPage - 1) * pageSize;
    return optionTrades.slice(start, start + pageSize);
  }, [optionTrades, optionPage, pageSize]);

  // Handle null/undefined summary
  const safeSummary = summary || {
    symbol: filters?.symbol || stockTrades[0]?.Symbol || optionTrades[0]?.Symbol || 'Trades',
    totalShares: 0,
    totalCost: 0,
    currentValue: 0,
  };

  const pnl = safeSummary.currentValue - safeSummary.totalCost;
  const pnlPercent = safeSummary.totalCost > 0 ? (pnl / safeSummary.totalCost) * 100 : 0;

  // Get active filter chips
  const activeFilterChips = filters
    ? Object.entries(filters)
        .filter(([, value]) => value && value !== 'all')
        .map(([key, value]) => ({
          key: key as keyof ActiveFilters,
          label: formatFilterLabel(key, value),
        }))
    : [];

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

  // Additional styles for filters and aggregations
  const filterStyles: Record<string, React.CSSProperties> = {
    filterBar: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 16px',
      backgroundColor: '#141414',
      borderBottom: `1px solid ${colors.border}`,
      flexWrap: 'wrap',
    },
    filterIcon: {
      color: '#00c806',
      marginRight: '4px',
    },
    filterChip: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 10px',
      backgroundColor: 'rgba(0, 200, 6, 0.1)',
      border: '1px solid rgba(0, 200, 6, 0.3)',
      borderRadius: '12px',
      fontSize: '11px',
      fontWeight: 500,
      color: '#00c806',
    },
    filterChipClose: {
      background: 'none',
      border: 'none',
      padding: '0',
      cursor: 'pointer',
      color: '#00c806',
      display: 'flex',
      alignItems: 'center',
      opacity: 0.7,
    },
    aggregationBar: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      padding: '12px 16px',
      backgroundColor: 'rgba(0, 200, 6, 0.05)',
      borderBottom: `1px solid ${colors.border}`,
      flexWrap: 'wrap',
    },
    aggregationItem: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '2px',
    },
    aggregationLabel: {
      fontSize: '10px',
      fontWeight: 600,
      color: colors.textMuted,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
    },
    aggregationValue: {
      fontSize: '14px',
      fontWeight: 600,
      color: colors.textPrimary,
      fontFamily: '"JetBrains Mono", monospace',
    },
  };

  // Pagination styles
  const paginationStyles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      padding: '12px 16px',
      backgroundColor: colors.bgHeader,
      borderTop: `1px solid ${colors.border}`,
    },
    button: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '32px',
      height: '32px',
      backgroundColor: 'transparent',
      border: `1px solid ${colors.border}`,
      borderRadius: '6px',
      color: colors.textSecondary,
      cursor: 'pointer',
    },
    buttonDisabled: {
      opacity: 0.4,
      cursor: 'not-allowed',
    },
    pageInfo: {
      fontSize: '12px',
      color: colors.textSecondary,
      minWidth: '80px',
      textAlign: 'center' as const,
    },
  };

  // Pagination component
  const PaginationControls = ({
    currentPage,
    totalPages,
    onPageChange,
    totalItems,
    label,
  }: {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    totalItems: number;
    label: string;
  }) => {
    if (totalPages <= 1) return null;

    return (
      <div style={paginationStyles.container}>
        <button
          style={{
            ...paginationStyles.button,
            ...(currentPage === 1 ? paginationStyles.buttonDisabled : {}),
          }}
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          title="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <span style={paginationStyles.pageInfo}>
          {label}: {currentPage} / {totalPages} ({totalItems})
        </span>
        <button
          style={{
            ...paginationStyles.button,
            ...(currentPage === totalPages ? paginationStyles.buttonDisabled : {}),
          }}
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          title="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>{safeSummary.symbol} Trades</span>
        <div style={styles.headerActions}>
          <button style={styles.iconButton} title="Download">
            <Download size={16} />
          </button>
          <button style={styles.iconButton} title="Expand">
            <Maximize2 size={16} />
          </button>
        </div>
      </div>

      {/* Active Filters */}
      {activeFilterChips.length > 0 && (
        <div style={filterStyles.filterBar}>
          <Filter size={14} style={filterStyles.filterIcon} />
          {activeFilterChips.map(chip => (
            <span key={chip.key} style={filterStyles.filterChip}>
              {chip.label}
              {onClearFilter && (
                <button
                  onClick={() => onClearFilter(chip.key)}
                  style={filterStyles.filterChipClose}
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Aggregations Bar */}
      {aggregations && (
        <div style={filterStyles.aggregationBar}>
          <div style={filterStyles.aggregationItem}>
            <span style={filterStyles.aggregationLabel}>Trades</span>
            <span style={filterStyles.aggregationValue}>{aggregations.tradeCount}</span>
          </div>
          <div style={filterStyles.aggregationItem}>
            <span style={filterStyles.aggregationLabel}>Total Value</span>
            <span style={filterStyles.aggregationValue}>{formatCurrency(aggregations.totalPremium)}</span>
          </div>
          <div style={filterStyles.aggregationItem}>
            <span style={filterStyles.aggregationLabel}>Avg/Trade</span>
            <span style={filterStyles.aggregationValue}>{formatCurrency(aggregations.avgPremium)}</span>
          </div>
          {aggregations.buyCount !== undefined && aggregations.sellCount !== undefined && (
            <div style={filterStyles.aggregationItem}>
              <span style={filterStyles.aggregationLabel}>Buy/Sell</span>
              <span style={filterStyles.aggregationValue}>
                <span style={{ color: colors.buy }}>{aggregations.buyCount}</span>
                {' / '}
                <span style={{ color: colors.sell }}>{aggregations.sellCount}</span>
              </span>
            </div>
          )}
          {aggregations.callCount !== undefined && aggregations.putCount !== undefined &&
           (aggregations.callCount > 0 || aggregations.putCount > 0) && (
            <div style={filterStyles.aggregationItem}>
              <span style={filterStyles.aggregationLabel}>Call/Put</span>
              <span style={filterStyles.aggregationValue}>
                <span style={{ color: '#4da6ff' }}>{aggregations.callCount}</span>
                {' / '}
                <span style={{ color: '#ffa64d' }}>{aggregations.putCount}</span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      <div style={styles.summarySection}>
        <p style={styles.summaryText}>
          <span style={styles.summaryValue}>{safeSummary.totalShares.toLocaleString()}</span> shares purchased for{' '}
          <span style={styles.summaryValue}>{formatCurrency(safeSummary.totalCost)}</span>
          {' '}&bull;{' '}Current value:{' '}
          <span style={styles.summaryValue}>{formatCurrency(safeSummary.currentValue)}</span>
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
                {paginatedStockTrades.map((trade, index) => {
                  const netAmount = parseFloat(trade.NetAmount || '0');
                  const globalIndex = (stockPage - 1) * pageSize + index;
                  return (
                    <tr key={trade.TradeID} style={{ backgroundColor: index % 2 === 0 ? colors.bgRow : colors.bgRowAlt }}>
                      <td style={{ ...styles.td, ...styles.tdCenter, ...styles.rowNum }}>{globalIndex + 1}</td>
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
          <PaginationControls
            currentPage={stockPage}
            totalPages={stockTotalPages}
            onPageChange={setStockPage}
            totalItems={stockTrades.length}
            label="Stocks"
          />
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
                {paginatedOptionTrades.map((trade, index) => {
                  const netAmount = parseFloat(trade.NetAmount || '0');
                  const globalIndex = (optionPage - 1) * pageSize + index;
                  return (
                    <tr key={trade.TradeID} style={{ backgroundColor: index % 2 === 0 ? colors.bgRow : colors.bgRowAlt }}>
                      <td style={{ ...styles.td, ...styles.tdCenter, ...styles.rowNum }}>{globalIndex + 1}</td>
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
          <PaginationControls
            currentPage={optionPage}
            totalPages={optionTotalPages}
            onPageChange={setOptionPage}
            totalItems={optionTrades.length}
            label="Options"
          />
        </>
      )}
    </div>
  );
}
