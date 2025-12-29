'use client';

import React, { useState } from 'react';
import { TrendingDown, TrendingUp, Zap, Target, ChevronDown, ChevronUp, Calendar, Layers, BarChart3 } from 'lucide-react';
import { safeParseNumber } from '@/src/lib/trade-math';

// Parse OCC option symbol to extract expiration date
function parseExpirationFromSymbol(occSymbol: string): string | null {
  const match = occSymbol.match(/^[A-Z]{1,6}(\d{6})[CP]\d{8}$/);
  if (match) {
    const dateStr = match[1];
    const year = 2000 + parseInt(dateStr.substring(0, 2));
    const month = parseInt(dateStr.substring(2, 4)) - 1;
    const day = parseInt(dateStr.substring(4, 6));
    const date = new Date(year, month, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return null;
}

interface OptionTrade {
  TradeID: number;
  Date: string;
  Symbol: string;
  SecurityType?: string;
  TradeType: string;
  Strike?: string;
  Expiration?: string;
  'Call/Put'?: string;
  OptionContracts?: string;
  OptionTradePremium?: string;
  NetAmount: string;
}

interface BulkOptionsCardProps {
  trades: OptionTrade[];
  symbol?: string;
  callPut?: 'call' | 'put';
  tradeType?: 'buy' | 'sell' | 'all';
  timePeriod?: string;
  aggregations?: {
    tradeCount?: number;
    totalTrades?: number;
    totalPremium: number;
    totalNetAmount?: number;
    avgPremium?: number;
    totalContracts?: number;
    sharesCovered?: number;
    callCount: number;
    putCount: number;
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

// Format per-share values with exact precision (no rounding)
const formatPerShare = (value: number) => {
  // Show up to 4 decimal places, trim trailing zeros but keep at least 2
  const formatted = value.toFixed(4);
  const trimmed = formatted.replace(/(\.\d{2})0+$/, '$1').replace(/(\.\d{3})0$/, '$1');
  return trimmed;
};

const formatDate = (dateStr: string) => {
  // Parse as local time to avoid UTC → local timezone shift
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

// Terminal Luxe color palette
const palette = {
  void: '#000000',
  surface: '#050505',
  elevated: '#0a0a0a',
  card: '#0f0f0f',
  border: '#1a1a1a',
  borderLight: '#252525',
  textPrimary: '#ffffff',
  textSecondary: '#a0a0a0',
  textMuted: '#606060',
  textDim: '#404040',
  profit: '#00ff88',
  profitDim: 'rgba(0, 255, 136, 0.08)',
  profitGlow: 'rgba(0, 255, 136, 0.4)',
  loss: '#ff4466',
  lossDim: 'rgba(255, 68, 102, 0.08)',
  call: '#00d4ff',
  callDim: 'rgba(0, 212, 255, 0.12)',
  put: '#ff66b2',
  putDim: 'rgba(255, 102, 178, 0.12)',
  gold: '#ffd700',
  goldDim: 'rgba(255, 215, 0, 0.1)',
};

export function BulkOptionsCard({ trades, symbol, callPut, tradeType, timePeriod, aggregations }: BulkOptionsCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [showTrades, setShowTrades] = useState(false);

  const isSell = tradeType === 'sell';
  const isCall = callPut === 'call';

  // Calculate totals from aggregations or trades
  // Use NetAmount (not gross premium) to match voice API exactly - no rounding discrepancies
  const totalContracts = aggregations?.totalContracts ??
    trades.reduce((sum, trade) => sum + safeParseNumber(trade.OptionContracts), 0);
  const totalPremium = aggregations?.totalPremium ??
    trades.reduce((sum, trade) => sum + Math.abs(safeParseNumber(trade.NetAmount)), 0);
  const avgPremium = aggregations?.avgPremium ?? (totalContracts > 0 ? totalPremium / totalContracts / 100 : 0);
  const sharesCovered = aggregations?.sharesCovered ?? totalContracts * 100;
  const tradeCount = aggregations?.totalTrades ?? trades.length;

  // Group trades by strike for visual breakdown
  // Use NetAmount for consistency with voice API
  const strikeGroups = trades.reduce((acc, trade) => {
    const strike = trade.Strike || 'Unknown';
    if (!acc[strike]) {
      acc[strike] = { contracts: 0, premium: 0, count: 0 };
    }
    acc[strike].contracts += safeParseNumber(trade.OptionContracts);
    acc[strike].premium += Math.abs(safeParseNumber(trade.NetAmount));
    acc[strike].count += 1;
    return acc;
  }, {} as Record<string, { contracts: number; premium: number; count: number }>);

  const sortedStrikes = Object.entries(strikeGroups)
    .sort((a, b) => b[1].premium - a[1].premium);

  // Dynamic colors based on trade type
  const accentColor = isSell ? palette.profit : palette.loss;
  const accentDim = isSell ? palette.profitDim : palette.lossDim;
  const accentGlow = isSell ? palette.profitGlow : 'rgba(255, 68, 102, 0.3)';
  const typeColor = isCall ? palette.call : palette.put;
  const typeDim = isCall ? palette.callDim : palette.putDim;

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
          {isSell ? (
            <TrendingDown size={20} color={accentColor} strokeWidth={2} />
          ) : (
            <TrendingUp size={20} color={accentColor} strokeWidth={2} />
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
              {isSell ? 'SHORT' : 'LONG'} {isCall ? 'CALLS' : callPut === 'put' ? 'PUTS' : 'OPTIONS'}
            </span>
            <span style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: typeDim,
              color: typeColor,
              fontWeight: 600,
            }}>
              {isCall ? 'C' : 'P'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{
              fontSize: '16px',
              fontWeight: 700,
              color: palette.textPrimary,
            }}>
              {symbol || 'All'}
            </span>
            {timePeriod && (
              <span style={{
                fontSize: '11px',
                color: palette.textMuted,
              }}>
                {timePeriod}
              </span>
            )}
          </div>
        </div>

        {/* Premium - Hero Number */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontSize: '9px',
            color: palette.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '2px',
          }}>
            {isSell ? 'Collected' : 'Paid'}
          </div>
          <div style={{
            fontSize: '24px',
            fontWeight: 800,
            color: accentColor,
            lineHeight: 1,
            textShadow: `0 0 30px ${accentGlow}`,
          }}>
            {formatCurrency(totalPremium)}
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
          { icon: Layers, label: 'Contracts', value: totalContracts.toLocaleString() },
          { icon: BarChart3, label: 'Shares', value: sharesCovered.toLocaleString() },
          { icon: Zap, label: 'Trades', value: tradeCount.toString() },
          { icon: Target, label: 'Strikes', value: sortedStrikes.length.toString() },
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

        {/* Avg Premium Pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 10px',
          borderRadius: '100px',
          background: palette.elevated,
          border: `1px solid ${palette.border}`,
        }}>
          <span style={{ fontSize: '10px', color: palette.textMuted }}>Avg</span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: palette.textPrimary }}>
            ${formatPerShare(avgPremium)}
          </span>
          <span style={{ fontSize: '10px', color: palette.textMuted }}>/sh</span>
        </div>
      </div>

      {/* Show Details Toggle */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        style={{
          width: '100%',
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          backgroundColor: palette.void,
          border: 'none',
          borderTop: `1px solid ${palette.border}`,
          cursor: 'pointer',
          color: palette.textSecondary,
          fontSize: '11px',
          fontFamily: 'inherit',
          fontWeight: 500,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = palette.elevated;
          e.currentTarget.style.color = palette.textPrimary;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = palette.void;
          e.currentTarget.style.color = palette.textSecondary;
        }}
      >
        {showDetails ? 'Hide Details' : 'Show Details'}
        {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* Expandable Details Section */}
      {showDetails && (
        <>
          {/* Call/Put breakdown mini bar */}
          {(aggregations?.callCount !== undefined || aggregations?.putCount !== undefined) && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '20px',
              padding: '12px 20px',
              background: palette.surface,
              borderTop: `1px solid ${palette.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '2px',
                  backgroundColor: palette.call,
                }} />
                <span style={{ fontSize: '11px', color: palette.textSecondary }}>Calls</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: palette.call }}>
                  {aggregations?.callCount || 0}
                </span>
              </div>
              <div style={{ width: '1px', height: '12px', backgroundColor: palette.border }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '2px',
                  backgroundColor: palette.put,
                }} />
                <span style={{ fontSize: '11px', color: palette.textSecondary }}>Puts</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: palette.put }}>
                  {aggregations?.putCount || 0}
                </span>
              </div>
            </div>
          )}

          {/* Strike Breakdown - Visual Bar Chart */}
          {sortedStrikes.length > 0 && (() => {
            const maxPremium = Math.max(...sortedStrikes.map(([, d]) => d.premium));
            const displayStrikes = sortedStrikes.slice(0, 5);

            return (
              <div style={{
                padding: '14px 20px',
                background: palette.surface,
                borderTop: `1px solid ${palette.border}`,
              }}>
                <div style={{
                  fontSize: '9px',
                  fontWeight: 600,
                  color: palette.textDim,
                  textTransform: 'uppercase',
                  letterSpacing: '1.5px',
                  marginBottom: '10px',
                }}>
                  By Strike Price
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {displayStrikes.map(([strike, data]) => {
                    const barWidth = maxPremium > 0 ? (data.premium / maxPremium) * 100 : 0;
                    return (
                      <div key={strike} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{
                          width: '44px',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: palette.textPrimary,
                          textAlign: 'right',
                        }}>
                          ${parseFloat(strike).toFixed(0)}
                        </span>
                        <div style={{
                          flex: 1,
                          height: '24px',
                          backgroundColor: palette.elevated,
                          borderRadius: '4px',
                          overflow: 'hidden',
                          position: 'relative',
                        }}>
                          <div style={{
                            width: `${barWidth}%`,
                            height: '100%',
                            background: `linear-gradient(90deg, ${accentColor}40 0%, ${accentColor}15 100%)`,
                            borderRadius: '4px',
                          }} />
                          <div style={{
                            position: 'absolute',
                            top: 0,
                            left: '8px',
                            right: '8px',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}>
                            <span style={{ fontSize: '10px', color: palette.textSecondary }}>
                              {data.contracts}×
                            </span>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: accentColor }}>
                              {formatCurrency(data.premium)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {sortedStrikes.length > 5 && (
                    <div style={{
                      fontSize: '10px',
                      color: palette.textDim,
                      textAlign: 'center',
                      paddingTop: '2px',
                    }}>
                      +{sortedStrikes.length - 5} more strikes
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Expandable Trade List */}
          <div style={{ borderTop: `1px solid ${palette.border}` }}>
            <button
              onClick={() => setShowTrades(!showTrades)}
              style={{
                width: '100%',
                padding: '12px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: palette.textSecondary,
                fontSize: '12px',
                fontFamily: 'inherit',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = palette.elevated}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={12} color={accentColor} />
                <span style={{ color: palette.textPrimary, fontWeight: 500 }}>View All Trades</span>
                <span style={{
                  padding: '2px 6px',
                  borderRadius: '100px',
                  backgroundColor: palette.border,
                  fontSize: '10px',
                  color: palette.textMuted,
                }}>
                  {trades.length}
                </span>
              </span>
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                backgroundColor: palette.elevated,
                border: `1px solid ${palette.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {showTrades ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </div>
            </button>

            {showTrades && (
              <div style={{
                borderTop: `1px solid ${palette.border}`,
                maxHeight: '300px',
                overflowY: 'auto',
              }}>
                {/* Table Header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '70px 70px 55px 70px 50px 90px',
                  padding: '10px 16px',
                  backgroundColor: palette.void,
                  borderBottom: `1px solid ${palette.border}`,
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                }}>
                  {['DATE', 'STRIKE', 'TYPE', 'EXPIRY', 'QTY', 'PREMIUM'].map((header) => (
                    <div key={header} style={{
                      fontSize: '8px',
                      fontWeight: 700,
                      color: palette.textDim,
                      letterSpacing: '0.5px',
                      textAlign: header === 'PREMIUM' || header === 'QTY' ? 'right' : 'left',
                    }}>
                      {header}
                    </div>
                  ))}
                </div>

                {/* Trade Rows */}
                {trades.map((trade, i) => {
                  // Use NetAmount for consistency with voice API - no rounding discrepancies
                  const premiumUSD = Math.abs(safeParseNumber(trade.NetAmount));
                  const contracts = safeParseNumber(trade.OptionContracts);
                  const strike = safeParseNumber(trade.Strike);
                  const isTradeCall = trade['Call/Put'] === 'C';
                  const expiry = trade.Expiration
                    ? formatDate(trade.Expiration)
                    : parseExpirationFromSymbol(trade.Symbol);
                  const rowTypeColor = isTradeCall ? palette.call : palette.put;

                  return (
                    <div
                      key={trade.TradeID}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '70px 70px 55px 70px 50px 90px',
                        alignItems: 'center',
                        padding: '10px 16px',
                        backgroundColor: i % 2 === 0 ? palette.surface : palette.void,
                        borderBottom: `1px solid ${palette.border}`,
                      }}
                    >
                      <div style={{ fontSize: '11px', color: palette.textSecondary }}>
                        {formatDate(trade.Date)}
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: palette.textPrimary }}>
                        ${strike.toFixed(0)}
                      </div>
                      <div>
                        <span style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          padding: '2px 5px',
                          borderRadius: '4px',
                          backgroundColor: isTradeCall ? palette.callDim : palette.putDim,
                          color: rowTypeColor,
                        }}>
                          {isTradeCall ? 'C' : 'P'}
                        </span>
                      </div>
                      <div style={{
                        fontSize: '10px',
                        color: palette.textMuted,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                      }}>
                        <Calendar size={9} color={palette.textDim} />
                        {expiry || '—'}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: palette.textSecondary,
                        textAlign: 'right',
                        fontWeight: 600,
                      }}>
                        {contracts}×
                      </div>
                      <div style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: accentColor,
                        textAlign: 'right',
                      }}>
                        {formatCurrency(premiumUSD)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
