'use client';

import React, { useState, useMemo } from 'react';
import { Download, ChevronLeft, ChevronRight, BarChart3, Layers, DollarSign, TrendingUp, Shuffle } from 'lucide-react';
import { downloadCsv, toCsv } from '@/src/lib/csv';
import { getTradeCashFlowUSD, safeParseNumber } from '@/src/lib/trade-math';

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

// Terminal Luxe color palette
const palette = {
  void: '#000000',
  surface: '#050505',
  elevated: '#0a0a0a',
  card: '#0f0f0f',
  border: '#1a1a1a',
  textPrimary: '#ffffff',
  textSecondary: '#a0a0a0',
  textMuted: '#606060',
  textDim: '#404040',
  profit: '#00ff88',
  profitDim: 'rgba(0, 255, 136, 0.08)',
  loss: '#ff4466',
  lossDim: 'rgba(255, 68, 102, 0.08)',
  call: '#00d4ff',
  callDim: 'rgba(0, 212, 255, 0.12)',
  put: '#ff66b2',
  putDim: 'rgba(255, 102, 178, 0.12)',
  cyan: '#06b6d4',
  cyanDim: 'rgba(6, 182, 212, 0.12)',
  cyanGlow: 'rgba(6, 182, 212, 0.4)',
};

const ITEMS_PER_PAGE = 5;

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

// Get display symbol - for options, extract the ticker (leading letters)
const getDisplaySymbol = (symbol: string, isOption: boolean): string => {
  if (!isOption) return symbol;
  // Extract leading uppercase letters (handles any option symbol format)
  const match = symbol.match(/^([A-Z]+)/);
  return match ? match[1] : symbol;
};

export function TradesTable({ trades, summary, filters, aggregations, pageSize = ITEMS_PER_PAGE }: TradesTableProps) {
  const [currentPage, setCurrentPage] = useState(1);

  const handleDownload = () => {
    const rows = trades.map((trade) => ({
      TradeID: trade.TradeID,
      Date: trade.Date,
      Symbol: trade.Symbol,
      SecurityType: trade.SecurityType,
      TradeType: trade.TradeType,
      StockShareQty: trade.StockShareQty,
      StockTradePrice: trade.StockTradePrice,
      OptionContracts: trade.OptionContracts,
      OptionTradePremium: trade.OptionTradePremium,
      Strike: trade.Strike || '',
      Expiration: trade.Expiration || '',
      CallPut: trade['Call/Put'] || '',
      NetAmount: trade.NetAmount,
      AmountUSD: getTradeCashFlowUSD(trade),
    }));

    const filenameBase = (filters?.symbol || summary?.symbol || trades[0]?.Symbol || 'trades').toString().trim() || 'trades';
    downloadCsv(`${filenameBase}_trades.csv`, toCsv(rows));
  };

  const stockTrades = useMemo(() => trades.filter(t => t.SecurityType === 'S'), [trades]);
  const optionTrades = useMemo(() => trades.filter(t => t.SecurityType === 'O'), [trades]);
  const allTrades = useMemo(() => [...trades].sort((a, b) => new Date(b.Date).getTime() - new Date(a.Date).getTime()), [trades]);

  // Pagination
  const totalPages = Math.ceil(allTrades.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentTrades = allTrades.slice(startIndex, endIndex);

  // Calculate aggregations
  const agg = aggregations || {
    tradeCount: trades.length,
    totalPremium: trades.reduce((sum, t) => sum + Math.abs(getTradeCashFlowUSD(t)), 0),
    avgPremium: trades.length > 0 ? trades.reduce((sum, t) => sum + Math.abs(getTradeCashFlowUSD(t)), 0) / trades.length : 0,
    totalQuantity: trades.reduce((sum, t) => {
      return sum + (t.SecurityType === 'O' ? safeParseNumber(t.OptionContracts) : safeParseNumber(t.StockShareQty));
    }, 0),
    buyCount: trades.filter(t => t.TradeType === 'B').length,
    sellCount: trades.filter(t => t.TradeType === 'S').length,
    stockCount: stockTrades.length,
    optionCount: optionTrades.length,
  };

  const displaySymbol = filters?.symbol || summary?.symbol || trades[0]?.Symbol || 'All';

  if (trades.length === 0) {
    return (
      <div style={{
        background: `linear-gradient(180deg, ${palette.card} 0%, ${palette.void} 100%)`,
        borderRadius: '20px',
        border: `1px solid ${palette.border}`,
        overflow: 'hidden',
        marginTop: '12px',
        marginBottom: '12px',
        boxShadow: `0 16px 32px -8px rgba(0, 0, 0, 0.6), 0 0 0 1px ${palette.border}`,
        fontFamily: '"JetBrains Mono", "SF Mono", "Fira Code", monospace',
      }}>
        <div style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          background: `radial-gradient(ellipse at left, ${palette.cyanDim} 0%, transparent 50%)`,
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: `linear-gradient(135deg, ${palette.cyan}20 0%, ${palette.cyan}05 100%)`,
            border: `1px solid ${palette.cyan}30`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <BarChart3 size={20} color={palette.cyan} strokeWidth={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: '9px',
              fontWeight: 700,
              color: palette.cyan,
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              marginBottom: '2px',
            }}>
              TRADES
            </div>
            <div style={{ fontSize: '14px', color: palette.textMuted }}>
              No trades found
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: `linear-gradient(180deg, ${palette.card} 0%, ${palette.void} 100%)`,
      borderRadius: '20px',
      border: `1px solid ${palette.border}`,
      overflow: 'hidden',
      marginTop: '12px',
      marginBottom: '12px',
      boxShadow: `0 16px 32px -8px rgba(0, 0, 0, 0.6), 0 0 0 1px ${palette.border}`,
      fontFamily: '"JetBrains Mono", "SF Mono", "Fira Code", monospace',
    }}>
      {/* Compact Header + Hero Combined */}
      <div style={{
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        background: `radial-gradient(ellipse at left, ${palette.cyanDim} 0%, transparent 50%)`,
      }}>
        {/* Icon */}
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '12px',
          background: `linear-gradient(135deg, ${palette.cyan}20 0%, ${palette.cyan}05 100%)`,
          border: `1px solid ${palette.cyan}30`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <BarChart3 size={20} color={palette.cyan} strokeWidth={2} />
        </div>

        {/* Main Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
            <span style={{
              fontSize: '9px',
              fontWeight: 700,
              color: palette.cyan,
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
            }}>
              TRADES
            </span>
            {filters?.fromDate && (
              <span style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: palette.cyanDim,
                color: palette.cyan,
                fontWeight: 600,
              }}>
                {filters.fromDate}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{
              fontSize: '16px',
              fontWeight: 700,
              color: palette.textPrimary,
            }}>
              {displaySymbol}
            </span>
            <span style={{
              fontSize: '11px',
              color: palette.textMuted,
            }}>
              {agg.tradeCount} trade{agg.tradeCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Total Value - Hero Number */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontSize: '9px',
            color: palette.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '2px',
          }}>
            Total Value
          </div>
          <div style={{
            fontSize: '22px',
            fontWeight: 800,
            color: palette.textPrimary,
            lineHeight: 1,
          }}>
            {formatCurrency(agg.totalPremium)}
          </div>
        </div>

        {/* Download Button */}
        <button
          onClick={handleDownload}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            border: `1px solid ${palette.border}`,
            backgroundColor: palette.elevated,
            color: palette.textSecondary,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          title="Download CSV"
        >
          <Download size={14} />
        </button>
      </div>

      {/* Compact Stats Row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        borderTop: `1px solid ${palette.border}`,
        background: palette.surface,
        gap: '8px',
        flexWrap: 'wrap',
      }}>
        {/* Stock/Option breakdown - prominent badges */}
        {(agg.stockCount !== undefined || agg.optionCount !== undefined) && (agg.stockCount! > 0 || agg.optionCount! > 0) && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}>
            {agg.stockCount! > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '6px',
                backgroundColor: 'rgba(147, 51, 234, 0.12)',
                border: '1px solid rgba(147, 51, 234, 0.25)',
              }}>
                <TrendingUp size={14} color="#a855f7" strokeWidth={2.5} />
                <span style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#a855f7',
                }}>
                  {agg.stockCount}
                </span>
                <span style={{
                  fontSize: '10px',
                  color: '#c084fc',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  Stock{agg.stockCount !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            {agg.optionCount! > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '6px',
                backgroundColor: palette.cyanDim,
                border: `1px solid ${palette.cyan}40`,
              }}>
                <Shuffle size={14} color={palette.cyan} strokeWidth={2.5} />
                <span style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: palette.cyan,
                }}>
                  {agg.optionCount}
                </span>
                <span style={{
                  fontSize: '10px',
                  color: palette.cyan,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  opacity: 0.8,
                }}>
                  Option{agg.optionCount !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Qty stat */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <Layers size={12} color={palette.textDim} />
          <span style={{
            fontSize: '13px',
            fontWeight: 700,
            color: palette.textPrimary,
          }}>
            {agg.totalQuantity.toLocaleString()}
          </span>
          <span style={{
            fontSize: '10px',
            color: palette.textMuted,
            textTransform: 'lowercase',
          }}>
            qty
          </span>
        </div>

        {/* Buy/Sell breakdown */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '2px', backgroundColor: palette.profit }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: palette.profit }}>{agg.buyCount || 0}</span>
            <span style={{ fontSize: '9px', color: palette.textMuted }}>buy</span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '2px', backgroundColor: palette.loss }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: palette.loss }}>{agg.sellCount || 0}</span>
            <span style={{ fontSize: '9px', color: palette.textMuted }}>sell</span>
          </div>
        </div>

        {/* Avg Value Pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 10px',
          borderRadius: '100px',
          background: palette.elevated,
          border: `1px solid ${palette.border}`,
        }}>
          <DollarSign size={10} color={palette.textMuted} />
          <span style={{ fontSize: '12px', fontWeight: 700, color: palette.textPrimary }}>
            {formatCurrency(agg.avgPremium)}
          </span>
          <span style={{ fontSize: '10px', color: palette.textMuted }}>/avg</span>
        </div>
      </div>

      {/* Ultra-Compact Table */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr>
              {['DATE', 'SYM', 'TYPE', 'QTY', 'PRICE', 'VALUE'].map((header, i) => (
                <th key={i} style={{
                  padding: '6px 8px',
                  textAlign: i >= 3 ? 'right' : 'left',
                  fontFamily: 'inherit',
                  fontSize: '8px',
                  fontWeight: 600,
                  color: palette.textDim,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  borderBottom: `1px solid ${palette.border}`,
                  backgroundColor: palette.void,
                  whiteSpace: 'nowrap',
                }}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {currentTrades.map((trade, index) => {
              const netAmount = getTradeCashFlowUSD(trade);
              const isBuy = trade.TradeType === 'B';
              const isOption = trade.SecurityType === 'O';
              const qty = isOption ? safeParseNumber(trade.OptionContracts) : safeParseNumber(trade.StockShareQty);
              const price = isOption ? safeParseNumber(trade.OptionTradePremium) : safeParseNumber(trade.StockTradePrice);

              return (
                <tr
                  key={trade.TradeID}
                  style={{ backgroundColor: index % 2 === 0 ? palette.surface : palette.void }}
                >
                  {/* Date */}
                  <td style={{
                    padding: '5px 8px',
                    borderBottom: `1px solid ${palette.border}`,
                    color: palette.textSecondary,
                    fontSize: '11px',
                  }}>
                    {formatDate(trade.Date)}
                  </td>
                  {/* Symbol */}
                  <td style={{
                    padding: '5px 8px',
                    borderBottom: `1px solid ${palette.border}`,
                    fontWeight: 700,
                    fontSize: '11px',
                    color: palette.textPrimary,
                  }}>
                    {getDisplaySymbol(trade.Symbol, isOption)}
                    {isOption && (
                      <span style={{
                        marginLeft: '4px',
                        fontSize: '9px',
                        fontWeight: 700,
                        padding: '1px 3px',
                        borderRadius: '3px',
                        backgroundColor: trade['Call/Put'] === 'C' ? palette.callDim : palette.putDim,
                        color: trade['Call/Put'] === 'C' ? palette.call : palette.put,
                      }}>
                        {trade['Call/Put']}
                      </span>
                    )}
                  </td>
                  {/* Type badge */}
                  <td style={{
                    padding: '5px 8px',
                    borderBottom: `1px solid ${palette.border}`,
                  }}>
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      padding: '2px 4px',
                      borderRadius: '3px',
                      backgroundColor: isBuy ? palette.profitDim : palette.lossDim,
                      color: isBuy ? palette.profit : palette.loss,
                    }}>
                      {isBuy ? 'B' : 'S'}
                    </span>
                  </td>
                  {/* Qty */}
                  <td style={{
                    padding: '5px 8px',
                    borderBottom: `1px solid ${palette.border}`,
                    textAlign: 'right',
                    color: palette.textSecondary,
                    fontWeight: 600,
                    fontSize: '11px',
                  }}>
                    {qty}{isOption ? '×' : ''}
                  </td>
                  {/* Price */}
                  <td style={{
                    padding: '5px 8px',
                    borderBottom: `1px solid ${palette.border}`,
                    textAlign: 'right',
                    fontWeight: 600,
                    fontSize: '11px',
                    color: palette.textPrimary,
                  }}>
                    {formatCurrency(price)}
                  </td>
                  {/* Value */}
                  <td style={{
                    padding: '5px 8px',
                    borderBottom: `1px solid ${palette.border}`,
                    textAlign: 'right',
                    fontWeight: 700,
                    fontSize: '11px',
                    color: netAmount >= 0 ? palette.profit : palette.loss,
                  }}>
                    {formatCurrency(netAmount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Compact Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 20px',
          borderTop: `1px solid ${palette.border}`,
          backgroundColor: palette.void,
        }}>
          <div style={{
            fontSize: '10px',
            color: palette.textMuted,
          }}>
            <span style={{ color: palette.textSecondary }}>{startIndex + 1}-{Math.min(endIndex, allTrades.length)}</span>
            <span> of </span>
            <span style={{ color: palette.textSecondary }}>{allTrades.length}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                border: `1px solid ${currentPage === 1 ? palette.border : palette.textDim}`,
                backgroundColor: palette.elevated,
                color: currentPage === 1 ? palette.textDim : palette.textPrimary,
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                opacity: currentPage === 1 ? 0.5 : 1,
              }}
            >
              <ChevronLeft size={14} />
            </button>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              padding: '0 6px',
            }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                const showPage = page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1;
                const showEllipsis = (page === 2 && currentPage > 3) || (page === totalPages - 1 && currentPage < totalPages - 2);

                if (!showPage && !showEllipsis) return null;

                if (showEllipsis && !showPage) {
                  return <span key={`e-${page}`} style={{ fontSize: '10px', color: palette.textDim }}>···</span>;
                }

                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    style={{
                      fontSize: '10px',
                      fontWeight: page === currentPage ? 700 : 500,
                      minWidth: '24px',
                      height: '24px',
                      borderRadius: '4px',
                      border: page === currentPage ? `1px solid ${palette.cyan}` : '1px solid transparent',
                      backgroundColor: page === currentPage ? `${palette.cyan}20` : 'transparent',
                      color: page === currentPage ? palette.cyan : palette.textMuted,
                      cursor: 'pointer',
                    }}
                  >
                    {page}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                border: `1px solid ${currentPage === totalPages ? palette.border : palette.textDim}`,
                backgroundColor: palette.elevated,
                color: currentPage === totalPages ? palette.textDim : palette.textPrimary,
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                opacity: currentPage === totalPages ? 0.5 : 1,
              }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
