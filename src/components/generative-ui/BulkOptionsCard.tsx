'use client';

import React, { useState } from 'react';
import { TrendingDown, TrendingUp, Zap, Target, ChevronDown, ChevronUp, Calendar, DollarSign, Layers, BarChart3 } from 'lucide-react';
import { getOptionPremiumUSD, safeParseNumber } from '@/src/lib/trade-math';

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
  }).format(value);
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
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
  const [isExpanded, setIsExpanded] = useState(false);

  const isSell = tradeType === 'sell';
  const isCall = callPut === 'call';

  // Calculate totals from aggregations or trades
  const totalContracts = aggregations?.totalContracts ??
    trades.reduce((sum, trade) => sum + safeParseNumber(trade.OptionContracts), 0);
  const totalPremium = aggregations?.totalPremium ??
    trades.reduce((sum, trade) => sum + getOptionPremiumUSD(trade), 0);
  const avgPremium = aggregations?.avgPremium ?? (totalContracts > 0 ? totalPremium / totalContracts / 100 : 0);
  const sharesCovered = aggregations?.sharesCovered ?? totalContracts * 100;
  const tradeCount = aggregations?.totalTrades ?? trades.length;

  // Group trades by strike for visual breakdown
  const strikeGroups = trades.reduce((acc, trade) => {
    const strike = trade.Strike || 'Unknown';
    if (!acc[strike]) {
      acc[strike] = { contracts: 0, premium: 0, count: 0 };
    }
    acc[strike].contracts += safeParseNumber(trade.OptionContracts);
    acc[strike].premium += getOptionPremiumUSD(trade);
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
      borderRadius: '24px',
      border: `1px solid ${palette.border}`,
      overflow: 'hidden',
      marginTop: '16px',
      marginBottom: '16px',
      boxShadow: `0 24px 48px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px ${palette.border}, inset 0 1px 0 rgba(255,255,255,0.02)`,
      fontFamily: '"JetBrains Mono", "SF Mono", "Fira Code", monospace',
      position: 'relative',
    }}>
      {/* Accent line at top */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '24px',
        right: '24px',
        height: '1px',
        background: `linear-gradient(90deg, transparent 0%, ${accentColor}40 50%, transparent 100%)`,
      }} />

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 24px',
        borderBottom: `1px solid ${palette.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Icon with glow */}
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            background: `linear-gradient(135deg, ${accentColor}20 0%, ${accentColor}05 100%)`,
            border: `1px solid ${accentColor}30`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 24px ${accentGlow}, inset 0 1px 0 ${accentColor}20`,
          }}>
            {isSell ? (
              <TrendingDown size={22} color={accentColor} strokeWidth={2} />
            ) : (
              <TrendingUp size={22} color={accentColor} strokeWidth={2} />
            )}
          </div>
          <div>
            <div style={{
              fontSize: '10px',
              fontWeight: 700,
              color: accentColor,
              textTransform: 'uppercase',
              letterSpacing: '2px',
              marginBottom: '4px',
              textShadow: `0 0 20px ${accentGlow}`,
            }}>
              {isSell ? 'SHORT' : 'LONG'} {isCall ? 'CALLS' : callPut === 'put' ? 'PUTS' : 'OPTIONS'}
            </div>
            <div style={{
              fontSize: '18px',
              fontWeight: 600,
              color: palette.textPrimary,
              letterSpacing: '-0.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              {symbol || 'All Symbols'}
              {timePeriod && (
                <span style={{
                  fontSize: '12px',
                  color: palette.textMuted,
                  fontWeight: 500,
                }}>
                  • {timePeriod}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Type badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 14px',
          borderRadius: '100px',
          background: typeDim,
          border: `1px solid ${typeColor}30`,
        }}>
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: typeColor,
            boxShadow: `0 0 8px ${typeColor}`,
          }} />
          <span style={{
            fontSize: '11px',
            fontWeight: 600,
            color: typeColor,
            textTransform: 'uppercase',
            letterSpacing: '1px',
          }}>
            {isCall ? 'CALLS' : callPut === 'put' ? 'PUTS' : 'MIXED'}
          </span>
        </div>
      </div>

      {/* Hero Section - Premium Collected */}
      <div style={{
        padding: '40px 24px',
        background: `radial-gradient(ellipse at center top, ${accentDim} 0%, transparent 70%)`,
        textAlign: 'center',
        position: 'relative',
      }}>
        {/* Subtle grid pattern */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `linear-gradient(${palette.border} 1px, transparent 1px), linear-gradient(90deg, ${palette.border} 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
          opacity: 0.3,
          maskImage: 'radial-gradient(ellipse at center, black 0%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 0%, transparent 70%)',
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            color: palette.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '3px',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}>
            <DollarSign size={14} color={palette.textMuted} />
            Premium {isSell ? 'Collected' : 'Paid'}
          </div>

          {/* The big number */}
          <div style={{
            fontSize: '56px',
            fontWeight: 800,
            color: accentColor,
            lineHeight: 1,
            letterSpacing: '-3px',
            textShadow: `0 0 60px ${accentGlow}, 0 0 120px ${accentGlow}`,
            marginBottom: '16px',
          }}>
            {formatCurrency(totalPremium)}
          </div>

          {/* Per share average */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '100px',
            background: palette.elevated,
            border: `1px solid ${palette.border}`,
          }}>
            <span style={{ fontSize: '12px', color: palette.textMuted }}>Avg</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: palette.textPrimary }}>
              ${avgPremium.toFixed(2)}
            </span>
            <span style={{ fontSize: '12px', color: palette.textMuted }}>/share</span>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        borderTop: `1px solid ${palette.border}`,
        borderBottom: `1px solid ${palette.border}`,
      }}>
        {[
          { icon: Layers, label: 'Contracts', value: totalContracts.toLocaleString(), color: palette.textPrimary },
          { icon: BarChart3, label: 'Shares', value: sharesCovered.toLocaleString(), color: palette.textSecondary },
          { icon: Zap, label: 'Trades', value: tradeCount.toString(), color: palette.gold },
          { icon: Target, label: 'Strikes', value: sortedStrikes.length.toString(), color: typeColor },
        ].map((stat, i) => (
          <div
            key={stat.label}
            style={{
              padding: '20px 16px',
              textAlign: 'center',
              borderRight: i < 3 ? `1px solid ${palette.border}` : 'none',
              background: palette.surface,
            }}
          >
            <stat.icon size={16} color={palette.textDim} style={{ marginBottom: '8px' }} />
            <div style={{
              fontSize: '22px',
              fontWeight: 700,
              color: stat.color,
              marginBottom: '4px',
            }}>
              {stat.value}
            </div>
            <div style={{
              fontSize: '9px',
              fontWeight: 600,
              color: palette.textDim,
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Call/Put breakdown mini bar */}
      {(aggregations?.callCount || aggregations?.putCount) && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '24px',
          padding: '16px 24px',
          background: palette.void,
          borderBottom: `1px solid ${palette.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '2px',
              backgroundColor: palette.call,
              boxShadow: `0 0 8px ${palette.call}50`,
            }} />
            <span style={{ fontSize: '12px', color: palette.textSecondary }}>Calls</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: palette.call }}>
              {aggregations?.callCount || 0}
            </span>
          </div>
          <div style={{
            width: '1px',
            height: '16px',
            backgroundColor: palette.border,
          }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '2px',
              backgroundColor: palette.put,
              boxShadow: `0 0 8px ${palette.put}50`,
            }} />
            <span style={{ fontSize: '12px', color: palette.textSecondary }}>Puts</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: palette.put }}>
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
            padding: '20px 24px',
            background: palette.surface,
          }}>
            <div style={{
              fontSize: '10px',
              fontWeight: 600,
              color: palette.textDim,
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              marginBottom: '16px',
            }}>
              By Strike Price
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {displayStrikes.map(([strike, data]) => {
                const barWidth = maxPremium > 0 ? (data.premium / maxPremium) * 100 : 0;
                return (
                  <div key={strike} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{
                      width: '50px',
                      fontSize: '13px',
                      fontWeight: 700,
                      color: palette.textPrimary,
                      textAlign: 'right',
                      fontFamily: '"JetBrains Mono", monospace',
                    }}>
                      ${parseFloat(strike).toFixed(0)}
                    </span>
                    <div style={{
                      flex: 1,
                      height: '28px',
                      backgroundColor: palette.elevated,
                      borderRadius: '6px',
                      overflow: 'hidden',
                      position: 'relative',
                    }}>
                      <div style={{
                        width: `${barWidth}%`,
                        height: '100%',
                        background: `linear-gradient(90deg, ${accentColor}40 0%, ${accentColor}20 100%)`,
                        borderRadius: '6px',
                        transition: 'width 0.3s ease',
                      }} />
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: '10px',
                        right: '10px',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}>
                        <span style={{
                          fontSize: '11px',
                          color: palette.textSecondary,
                          fontFamily: '"JetBrains Mono", monospace',
                        }}>
                          {data.contracts}×
                        </span>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: accentColor,
                          fontFamily: '"JetBrains Mono", monospace',
                        }}>
                          {formatCurrency(data.premium)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {sortedStrikes.length > 5 && (
                <div style={{
                  fontSize: '11px',
                  color: palette.textDim,
                  textAlign: 'center',
                  paddingTop: '4px',
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
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            width: '100%',
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: palette.textSecondary,
            fontSize: '13px',
            fontFamily: 'inherit',
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = palette.elevated}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Zap size={14} color={accentColor} />
            <span style={{ color: palette.textPrimary, fontWeight: 500 }}>View All Trades</span>
            <span style={{
              padding: '2px 8px',
              borderRadius: '100px',
              backgroundColor: palette.border,
              fontSize: '11px',
              color: palette.textMuted,
            }}>
              {trades.length}
            </span>
          </span>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            backgroundColor: palette.elevated,
            border: `1px solid ${palette.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </button>

        {isExpanded && (
          <div style={{
            borderTop: `1px solid ${palette.border}`,
            maxHeight: '400px',
            overflowY: 'auto',
          }}>
            {/* Table Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '80px 90px 70px 80px 60px 100px',
              padding: '14px 20px',
              backgroundColor: palette.void,
              borderBottom: `1px solid ${palette.border}`,
              position: 'sticky',
              top: 0,
              zIndex: 1,
            }}>
              {['DATE', 'STRIKE', 'TYPE', 'EXPIRY', 'QTY', 'PREMIUM'].map((header) => (
                <div key={header} style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  color: palette.textDim,
                  letterSpacing: '1px',
                  textAlign: header === 'PREMIUM' || header === 'QTY' ? 'right' : 'left',
                }}>
                  {header}
                </div>
              ))}
            </div>

            {/* Trade Rows */}
            {trades.map((trade, i) => {
              const fallbackNetAmount = Math.abs(safeParseNumber(trade.NetAmount));
              const premiumUSD = getOptionPremiumUSD(trade) || fallbackNetAmount;
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
                    gridTemplateColumns: '80px 90px 70px 80px 60px 100px',
                    alignItems: 'center',
                    padding: '14px 20px',
                    backgroundColor: i % 2 === 0 ? palette.surface : palette.void,
                    borderBottom: `1px solid ${palette.border}`,
                    transition: 'background-color 0.1s ease',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = palette.elevated}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = i % 2 === 0 ? palette.surface : palette.void}
                >
                  <div style={{
                    fontSize: '12px',
                    color: palette.textSecondary,
                    fontWeight: 500,
                  }}>
                    {formatDate(trade.Date)}
                  </div>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: palette.textPrimary,
                  }}>
                    ${strike.toFixed(0)}
                  </div>
                  <div>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '4px 8px',
                      borderRadius: '6px',
                      backgroundColor: isTradeCall ? palette.callDim : palette.putDim,
                      color: rowTypeColor,
                      letterSpacing: '0.5px',
                    }}>
                      {isTradeCall ? 'CALL' : 'PUT'}
                    </span>
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: palette.textMuted,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                    <Calendar size={10} color={palette.textDim} />
                    {expiry || '—'}
                  </div>
                  <div style={{
                    fontSize: '13px',
                    color: palette.textSecondary,
                    textAlign: 'right',
                    fontWeight: 600,
                  }}>
                    {contracts}×
                  </div>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: accentColor,
                    textAlign: 'right',
                    textShadow: `0 0 20px ${accentGlow}`,
                  }}>
                    {formatCurrency(premiumUSD)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
