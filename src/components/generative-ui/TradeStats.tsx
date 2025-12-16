'use client';

import React from 'react';
import { TrendingUp, TrendingDown, BarChart3, DollarSign, Layers, Calendar } from 'lucide-react';

interface TradeStatsProps {
  symbol: string;
  year: number;
  tradeType: 'buy' | 'sell' | 'all';
  timePeriod?: string | null;
  highestPrice: number;
  highestPriceDate: string;
  highestPriceShares: number;
  lowestPrice: number;
  lowestPriceDate: string;
  lowestPriceShares: number;
  averagePrice: number;
  totalTrades: number;
  totalShares: number;
  totalValue: number;
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
  amber: '#ffaa00',
  amberDim: 'rgba(255, 170, 0, 0.12)',
  amberGlow: 'rgba(255, 170, 0, 0.4)',
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
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

export function TradeStats({
  symbol,
  year,
  tradeType,
  timePeriod,
  highestPrice,
  highestPriceDate,
  highestPriceShares,
  lowestPrice,
  lowestPriceDate,
  lowestPriceShares,
  averagePrice,
  totalTrades,
  totalShares,
  totalValue,
}: TradeStatsProps) {
  const typeLabel = tradeType === 'sell' ? 'Sell' : tradeType === 'buy' ? 'Buy' : 'All';
  const actionLabel = tradeType === 'sell' ? 'Sold' : tradeType === 'buy' ? 'Bought' : 'Traded';
  const accentColor = tradeType === 'sell' ? palette.loss : palette.profit;
  const accentDim = tradeType === 'sell' ? palette.lossDim : palette.profitDim;

  const formatTimePeriod = (period: string) => {
    return period.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const periodLabel = timePeriod ? formatTimePeriod(timePeriod) : String(year);

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
        background: `radial-gradient(ellipse at left, ${palette.amberDim} 0%, transparent 50%)`,
      }}>
        {/* Icon */}
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '12px',
          background: `linear-gradient(135deg, ${palette.amber}20 0%, ${palette.amber}05 100%)`,
          border: `1px solid ${palette.amber}30`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <BarChart3 size={20} color={palette.amber} strokeWidth={2} />
        </div>

        {/* Main Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
            <span style={{
              fontSize: '9px',
              fontWeight: 700,
              color: palette.amber,
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
            }}>
              PRICE STATS
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
              {periodLabel}
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
            Avg Price
          </div>
          <div style={{
            fontSize: '22px',
            fontWeight: 800,
            color: palette.textPrimary,
            lineHeight: 1,
          }}>
            {formatCurrency(averagePrice)}
          </div>
        </div>
      </div>

      {/* High/Low Stats Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        borderTop: `1px solid ${palette.border}`,
      }}>
        {/* Highest */}
        <div style={{
          padding: '12px 16px',
          background: palette.surface,
          borderRight: `1px solid ${palette.border}`,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '6px',
          }}>
            <TrendingUp size={12} color={palette.profit} />
            <span style={{
              fontSize: '9px',
              fontWeight: 700,
              color: palette.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              Highest {actionLabel}
            </span>
          </div>
          <div style={{
            fontSize: '18px',
            fontWeight: 700,
            color: palette.profit,
            marginBottom: '4px',
            textShadow: `0 0 20px ${palette.profitGlow}`,
          }}>
            {formatCurrency(highestPrice)}
          </div>
          <div style={{
            fontSize: '10px',
            color: palette.textMuted,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Calendar size={10} />
              {formatDate(highestPriceDate)}
            </span>
            <span>{highestPriceShares} shares</span>
          </div>
        </div>

        {/* Lowest */}
        <div style={{
          padding: '12px 16px',
          background: palette.surface,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '6px',
          }}>
            <TrendingDown size={12} color={palette.loss} />
            <span style={{
              fontSize: '9px',
              fontWeight: 700,
              color: palette.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              Lowest {actionLabel}
            </span>
          </div>
          <div style={{
            fontSize: '18px',
            fontWeight: 700,
            color: palette.loss,
            marginBottom: '4px',
          }}>
            {formatCurrency(lowestPrice)}
          </div>
          <div style={{
            fontSize: '10px',
            color: palette.textMuted,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Calendar size={10} />
              {formatDate(lowestPriceDate)}
            </span>
            <span>{lowestPriceShares} shares</span>
          </div>
        </div>
      </div>

      {/* Compact Footer Stats */}
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
          { icon: Layers, label: 'Shares', value: totalShares.toLocaleString() },
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
          <DollarSign size={10} color={palette.textMuted} />
          <span style={{ fontSize: '12px', fontWeight: 700, color: palette.textPrimary }}>
            {formatCurrency(totalValue)}
          </span>
          <span style={{ fontSize: '10px', color: palette.textMuted }}>total</span>
        </div>
      </div>
    </div>
  );
}
