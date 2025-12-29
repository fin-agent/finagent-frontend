'use client';

import React, { useState } from 'react';
import { TrendingUp, TrendingDown, BarChart3, Layers, ChevronDown, ChevronUp, Calculator } from 'lucide-react';

interface AveragePriceProps {
  symbol: string;
  averagePrice: number;
  timePeriod: string;
  tradeType: 'buy' | 'sell' | 'all';
  totalTrades: number;
  totalShares?: number;
  highestPrice?: number;
  lowestPrice?: number;
  breakdown?: {
    totalNotional: number;
    trades: Array<{
      date: string;
      shares: number;
      price: number;
      notional: number;
    }>;
  };
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
  profitGlow: 'rgba(0, 255, 136, 0.4)',
  loss: '#ff4466',
  lossDim: 'rgba(255, 68, 102, 0.08)',
  purple: '#a855f7',
  purpleDim: 'rgba(168, 85, 247, 0.12)',
  purpleGlow: 'rgba(168, 85, 247, 0.4)',
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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

export function AveragePrice({
  symbol,
  averagePrice,
  timePeriod,
  tradeType,
  totalTrades,
  totalShares,
  highestPrice,
  lowestPrice,
  breakdown,
}: AveragePriceProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const actionLabel = tradeType === 'sell' ? 'Sold' : tradeType === 'buy' ? 'Bought' : 'Traded';
  const typeLabel = tradeType === 'sell' ? 'Sell' : tradeType === 'buy' ? 'Buy' : 'All';
  const accentColor = tradeType === 'sell' ? palette.loss : palette.profit;
  const accentDim = tradeType === 'sell' ? palette.lossDim : palette.profitDim;
  const accentGlow = tradeType === 'sell' ? undefined : palette.profitGlow;

  const formatTimePeriod = (period: string) => {
    return period.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const canShowBreakdown = !!breakdown?.trades?.length && (totalShares ?? 0) > 0;

  // Calculate marker position for range bar
  const getMarkerPosition = () => {
    if (!highestPrice || !lowestPrice || highestPrice === lowestPrice) return 50;
    const range = highestPrice - lowestPrice;
    const position = ((averagePrice - lowestPrice) / range) * 100;
    return Math.max(5, Math.min(95, position));
  };

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
        background: `radial-gradient(ellipse at left, ${palette.purpleDim} 0%, transparent 50%)`,
      }}>
        {/* Icon */}
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '12px',
          background: `linear-gradient(135deg, ${palette.purple}20 0%, ${palette.purple}05 100%)`,
          border: `1px solid ${palette.purple}30`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Calculator size={20} color={palette.purple} strokeWidth={2} />
        </div>

        {/* Main Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
            <span style={{
              fontSize: '9px',
              fontWeight: 700,
              color: palette.purple,
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
            }}>
              AVG PRICE
            </span>
            <span style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: accentDim,
              color: accentColor,
              fontWeight: 600,
            }}>
              {typeLabel}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{
              fontSize: '16px',
              fontWeight: 700,
              color: palette.textPrimary,
            }}>
              {symbol}
            </span>
            <span style={{
              fontSize: '11px',
              color: palette.textMuted,
            }}>
              {formatTimePeriod(timePeriod)}
            </span>
          </div>
        </div>

        {/* Average Price - Hero Number */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontSize: '9px',
            color: palette.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '2px',
          }}>
            Avg {actionLabel}
          </div>
          <div style={{
            fontSize: '24px',
            fontWeight: 800,
            color: accentColor,
            lineHeight: 1,
            textShadow: accentGlow ? `0 0 30px ${accentGlow}` : undefined,
          }}>
            {formatCurrency(averagePrice)}
          </div>
        </div>
      </div>

      {/* Range Bar (if high/low available) */}
      {highestPrice && lowestPrice && highestPrice !== lowestPrice && (
        <div style={{
          padding: '12px 20px',
          borderTop: `1px solid ${palette.border}`,
          background: palette.surface,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              minWidth: '70px',
            }}>
              <TrendingDown size={12} color={palette.loss} />
              <span style={{ fontSize: '11px', fontWeight: 600, color: palette.loss }}>
                {formatCurrency(lowestPrice)}
              </span>
            </div>

            <div style={{
              flex: 1,
              height: '6px',
              borderRadius: '3px',
              background: `linear-gradient(90deg, ${palette.loss}40, ${palette.profit}40)`,
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute',
                top: '-5px',
                left: `calc(${getMarkerPosition()}% - 8px)`,
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: palette.purple,
                border: `2px solid ${palette.card}`,
                boxShadow: `0 0 10px ${palette.purpleGlow}`,
              }} />
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              minWidth: '70px',
              justifyContent: 'flex-end',
            }}>
              <TrendingUp size={12} color={palette.profit} />
              <span style={{ fontSize: '11px', fontWeight: 600, color: palette.profit }}>
                {formatCurrency(highestPrice)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Compact Stats Row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 20px',
        borderTop: `1px solid ${palette.border}`,
        background: palette.void,
        gap: '8px',
        flexWrap: 'wrap',
      }}>
        {[
          { icon: BarChart3, label: 'Trades', value: totalTrades.toString() },
          ...(totalShares !== undefined ? [{ icon: Layers, label: 'Shares', value: totalShares.toLocaleString() }] : []),
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

        {/* Per Share Label */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 10px',
          borderRadius: '100px',
          background: palette.elevated,
          border: `1px solid ${palette.border}`,
        }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: palette.purple }}>
            {formatCurrency(averagePrice)}
          </span>
          <span style={{ fontSize: '10px', color: palette.textMuted }}>/share</span>
        </div>
      </div>

      {/* Show Calculation Toggle */}
      {canShowBreakdown && (
        <button
          onClick={() => setShowBreakdown(!showBreakdown)}
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
          {showBreakdown ? 'Hide Calculation' : 'Show Calculation'}
          {showBreakdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      )}

      {/* Calculation Breakdown */}
      {showBreakdown && breakdown && (
        <div style={{
          borderTop: `1px solid ${palette.border}`,
          maxHeight: '200px',
          overflowY: 'auto',
        }}>
          {breakdown.trades.slice(0, 5).map((trade, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 20px',
                backgroundColor: index % 2 === 0 ? palette.surface : palette.void,
                borderBottom: `1px solid ${palette.border}`,
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '11px', color: palette.textSecondary }}>
                  {formatDate(trade.date)}
                </span>
                <span style={{ fontSize: '10px', color: palette.textMuted }}>
                  {Math.round(trade.shares).toLocaleString()} shares × {formatCurrency(trade.price)}
                </span>
              </div>
              <span style={{
                fontSize: '12px',
                fontWeight: 700,
                color: palette.textPrimary,
              }}>
                {formatCurrency(trade.notional)}
              </span>
            </div>
          ))}

          {/* Formula Summary */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 20px',
            backgroundColor: palette.elevated,
            borderTop: `1px solid ${palette.border}`,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: palette.textPrimary }}>
                Weighted Average
              </span>
              <span style={{ fontSize: '10px', color: palette.textMuted }}>
                {formatCurrency(breakdown.totalNotional)} ÷ {totalShares?.toLocaleString()} shares
              </span>
            </div>
            <span style={{
              fontSize: '14px',
              fontWeight: 700,
              color: palette.purple,
            }}>
              {formatCurrency(averagePrice)}
            </span>
          </div>

          {breakdown.trades.length > 5 && (
            <div style={{
              padding: '8px 20px',
              fontSize: '10px',
              color: palette.textDim,
              textAlign: 'center',
              backgroundColor: palette.void,
            }}>
              +{breakdown.trades.length - 5} more trades
            </div>
          )}
        </div>
      )}
    </div>
  );
}
