'use client';

import React, { useState } from 'react';
import { Clock, Flame, ChevronLeft, ChevronRight, Layers, Target, BarChart3 } from 'lucide-react';
import { safeParseNumber } from '@/src/lib/trade-math';
import { parseOptionSymbol } from '@/src/lib/symbol-utils';

interface ExpiringOption {
  TradeID: number;
  Date: string;
  Symbol: string;
  SecurityType: string;
  TradeType: string;
  Strike?: string;
  Expiration?: string;
  'Call/Put'?: string;
  OptionContracts?: string;
  OptionTradePremium?: string;
  NetAmount: string;
}

interface ExpiringOptionsTableProps {
  trades: ExpiringOption[];
  expirationPeriod: string;
  aggregations?: {
    tradeCount?: number;
    totalPremium?: number;
    callCount?: number;
    putCount?: number;
    totalContracts?: number;
  };
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const getDaysUntil = (expirationStr: string): number => {
  const exp = new Date(expirationStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);
  const diffTime = exp.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

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
  urgent: '#ff5252',
  urgentDim: 'rgba(255, 82, 82, 0.12)',
  urgentGlow: 'rgba(255, 82, 82, 0.4)',
  warning: '#ffa64d',
  warningDim: 'rgba(255, 166, 77, 0.12)',
  warningGlow: 'rgba(255, 166, 77, 0.4)',
};

const ITEMS_PER_PAGE = 5;

export function ExpiringOptionsTable({
  trades,
  expirationPeriod,
  aggregations: externalAggregations,
}: ExpiringOptionsTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const isUrgent = expirationPeriod.toLowerCase() === 'tomorrow';

  // Dynamic colors based on urgency
  const accentColor = isUrgent ? palette.urgent : palette.warning;
  const accentDim = isUrgent ? palette.urgentDim : palette.warningDim;
  const accentGlow = isUrgent ? palette.urgentGlow : palette.warningGlow;

  // Pagination
  const totalPages = Math.ceil(trades.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentTrades = trades.slice(startIndex, endIndex);

  // Calculate aggregations - use NetAmount for consistency
  const aggregations = {
    tradeCount: externalAggregations?.tradeCount ?? trades.length,
    totalPremium: externalAggregations?.totalPremium ?? trades.reduce((sum, trade) => {
      return sum + Math.abs(safeParseNumber(trade.NetAmount));
    }, 0),
    callCount: externalAggregations?.callCount ?? trades.filter(t => t['Call/Put'] === 'C').length,
    putCount: externalAggregations?.putCount ?? trades.filter(t => t['Call/Put'] === 'P').length,
    totalContracts: externalAggregations?.totalContracts ?? trades.reduce((sum, trade) => sum + safeParseNumber(trade.OptionContracts), 0),
  };

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
          background: `radial-gradient(ellipse at left, ${accentDim} 0%, transparent 50%)`,
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: `linear-gradient(135deg, ${accentColor}20 0%, ${accentColor}05 100%)`,
            border: `1px solid ${accentColor}30`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Clock size={20} color={accentColor} strokeWidth={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: '9px',
              fontWeight: 700,
              color: accentColor,
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              marginBottom: '2px',
            }}>
              EXPIRING {expirationPeriod.toUpperCase()}
            </div>
            <div style={{ fontSize: '14px', color: palette.textMuted }}>
              No options found
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
      position: 'relative',
    }}>
      {/* Urgent top bar */}
      {isUrgent && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: `linear-gradient(90deg, ${palette.urgent}, ${palette.warning}, ${palette.urgent})`,
        }} />
      )}

      {/* Compact Header + Hero Combined */}
      <div style={{
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        background: `radial-gradient(ellipse at left, ${accentDim} 0%, transparent 50%)`,
      }}>
        {/* Icon */}
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '12px',
          background: `linear-gradient(135deg, ${accentColor}20 0%, ${accentColor}05 100%)`,
          border: `1px solid ${accentColor}30`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {isUrgent ? (
            <Flame size={20} color={accentColor} strokeWidth={2} />
          ) : (
            <Clock size={20} color={accentColor} strokeWidth={2} />
          )}
        </div>

        {/* Main Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
            <span style={{
              fontSize: '9px',
              fontWeight: 700,
              color: accentColor,
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
            }}>
              EXPIRING {expirationPeriod.toUpperCase()}
            </span>
            {isUrgent && (
              <span style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: palette.urgentDim,
                color: palette.urgent,
                fontWeight: 600,
              }}>
                URGENT
              </span>
            )}
          </div>
          <div style={{
            fontSize: '14px',
            color: palette.textSecondary,
          }}>
            {aggregations.tradeCount} position{aggregations.tradeCount !== 1 ? 's' : ''} require attention
          </div>
        </div>

        {/* Total Contracts - Hero Number */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontSize: '9px',
            color: palette.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '2px',
          }}>
            Contracts
          </div>
          <div style={{
            fontSize: '24px',
            fontWeight: 800,
            color: accentColor,
            lineHeight: 1,
            textShadow: `0 0 30px ${accentGlow}`,
          }}>
            {aggregations.totalContracts}
          </div>
        </div>
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
        {[
          { icon: BarChart3, label: 'Positions', value: aggregations.tradeCount.toString() },
          { icon: Layers, label: 'Contracts', value: aggregations.totalContracts.toString() },
        ].map((stat) => (
          <div key={stat.label} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <stat.icon size={12} color={palette.textDim} />
            <span style={{
              fontSize: '13px',
              fontWeight: 700,
              color: palette.textPrimary,
            }}>
              {stat.value}
            </span>
            <span style={{
              fontSize: '10px',
              color: palette.textMuted,
              textTransform: 'lowercase',
            }}>
              {stat.label}
            </span>
          </div>
        ))}

        {/* Call/Put breakdown */}
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
            <div style={{ width: '6px', height: '6px', borderRadius: '2px', backgroundColor: palette.call }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: palette.call }}>{aggregations.callCount}</span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '2px', backgroundColor: palette.put }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: palette.put }}>{aggregations.putCount}</span>
          </div>
        </div>

        {/* Total Value Pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 10px',
          borderRadius: '100px',
          background: palette.elevated,
          border: `1px solid ${palette.border}`,
        }}>
          <Target size={10} color={palette.textMuted} />
          <span style={{ fontSize: '12px', fontWeight: 700, color: palette.profit }}>
            {formatCurrency(aggregations.totalPremium)}
          </span>
        </div>
      </div>

      {/* Ultra-Compact Table */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr>
              {['SYM', '', '', 'STRIKE', 'EXP', 'QTY', 'VALUE'].map((header, i) => (
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
              const premiumUSD = Math.abs(safeParseNumber(trade.NetAmount));
              const contracts = safeParseNumber(trade.OptionContracts);
              const strike = safeParseNumber(trade.Strike);
              const isCall = trade['Call/Put'] === 'C';
              const isBuy = trade.TradeType === 'B';
              const daysUntil = trade.Expiration ? getDaysUntil(trade.Expiration) : null;

              let daysColor = palette.textMuted;
              let daysBg = palette.elevated;
              if (daysUntil !== null) {
                if (daysUntil <= 1) {
                  daysColor = palette.urgent;
                  daysBg = palette.urgentDim;
                } else if (daysUntil <= 3) {
                  daysColor = palette.warning;
                  daysBg = palette.warningDim;
                }
              }

              return (
                <tr
                  key={trade.TradeID ? `${trade.TradeID}-${index}` : `trade-${index}`}
                  style={{ backgroundColor: index % 2 === 0 ? palette.surface : palette.void }}
                >
                  {/* Symbol */}
                  <td style={{
                    padding: '5px 8px',
                    borderBottom: `1px solid ${palette.border}`,
                    fontWeight: 700,
                    fontSize: '11px',
                    color: palette.textPrimary,
                  }}>
                    {parseOptionSymbol(trade.Symbol)}
                  </td>
                  {/* Type badge - minimal */}
                  <td style={{
                    padding: '5px 4px',
                    borderBottom: `1px solid ${palette.border}`,
                  }}>
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      padding: '2px 4px',
                      borderRadius: '3px',
                      backgroundColor: isBuy ? palette.lossDim : palette.profitDim,
                      color: isBuy ? palette.loss : palette.profit,
                    }}>
                      {isBuy ? 'L' : 'S'}
                    </span>
                  </td>
                  {/* C/P badge - minimal */}
                  <td style={{
                    padding: '5px 4px',
                    borderBottom: `1px solid ${palette.border}`,
                  }}>
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      padding: '2px 4px',
                      borderRadius: '3px',
                      backgroundColor: isCall ? palette.callDim : palette.putDim,
                      color: isCall ? palette.call : palette.put,
                    }}>
                      {isCall ? 'C' : 'P'}
                    </span>
                  </td>
                  {/* Strike */}
                  <td style={{
                    padding: '5px 8px',
                    borderBottom: `1px solid ${palette.border}`,
                    textAlign: 'right',
                    fontWeight: 600,
                    fontSize: '11px',
                    color: palette.textPrimary,
                  }}>
                    ${strike.toFixed(0)}
                  </td>
                  {/* Expiration - just countdown */}
                  <td style={{
                    padding: '5px 8px',
                    borderBottom: `1px solid ${palette.border}`,
                    textAlign: 'right',
                  }}>
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      padding: '2px 5px',
                      borderRadius: '3px',
                      backgroundColor: daysBg,
                      color: daysColor,
                    }}>
                      {daysUntil === 0 ? 'Today' : daysUntil === 1 ? '1d' : `${daysUntil}d`}
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
                    {contracts}×
                  </td>
                  {/* Value */}
                  <td style={{
                    padding: '5px 8px',
                    borderBottom: `1px solid ${palette.border}`,
                    textAlign: 'right',
                    fontWeight: 700,
                    fontSize: '11px',
                    color: isBuy ? palette.loss : palette.profit,
                  }}>
                    {formatCurrency(premiumUSD)}
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
            <span style={{ color: palette.textSecondary }}>{startIndex + 1}-{Math.min(endIndex, trades.length)}</span>
            <span> of </span>
            <span style={{ color: palette.textSecondary }}>{trades.length}</span>
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
                      border: page === currentPage ? `1px solid ${accentColor}` : '1px solid transparent',
                      backgroundColor: page === currentPage ? `${accentColor}20` : 'transparent',
                      color: page === currentPage ? accentColor : palette.textMuted,
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
