'use client';

import React from 'react';
import { Banknote, Calendar, Layers, BarChart3, TrendingUp, TrendingDown } from 'lucide-react';

interface TotalPremiumCardProps {
  symbol: string;
  tradeType: 'buy' | 'sell' | 'all';
  totalPremium: number;
  totalTrades: number;
  totalContracts: number;
  timePeriod: string;
  callCount?: number;
  putCount?: number;
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
  return `$${trimmed}`;
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
  profitGlow: 'rgba(0, 255, 136, 0.4)',
  loss: '#ff4466',
  lossDim: 'rgba(255, 68, 102, 0.08)',
  call: '#00d4ff',
  callDim: 'rgba(0, 212, 255, 0.12)',
  put: '#ff66b2',
  putDim: 'rgba(255, 102, 178, 0.12)',
  cyan: '#06b6d4',
  cyanDim: 'rgba(6, 182, 212, 0.12)',
};

export function TotalPremiumCard({
  symbol,
  tradeType,
  totalPremium,
  totalTrades,
  totalContracts,
  timePeriod,
  callCount = 0,
  putCount = 0,
}: TotalPremiumCardProps) {
  const isSell = tradeType === 'sell';
  const totalShares = totalContracts * 100;
  const perSharePremium = totalShares > 0 ? totalPremium / totalShares : 0;

  // Dynamic colors
  const accentColor = isSell ? palette.profit : palette.loss;
  const accentDim = isSell ? palette.profitDim : palette.lossDim;
  const accentGlow = isSell ? palette.profitGlow : 'rgba(255, 68, 102, 0.3)';
  const Icon = isSell ? TrendingUp : TrendingDown;

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
          <Banknote size={20} color={accentColor} strokeWidth={2} />
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
              TOTAL PREMIUM
            </span>
            <span style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: accentDim,
              color: accentColor,
              fontWeight: 600,
            }}>
              {isSell ? 'SELL' : tradeType === 'all' ? 'ALL' : 'BUY'}
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
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}>
              <Calendar size={10} />
              {timePeriod}
            </span>
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
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '4px',
          }}>
            <Icon size={10} />
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
          { icon: BarChart3, label: 'Trades', value: totalTrades.toString() },
          { icon: Layers, label: 'Contracts', value: totalContracts.toLocaleString() },
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
        {(callCount > 0 || putCount > 0) && (
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
              <span style={{ fontSize: '12px', fontWeight: 700, color: palette.call }}>{callCount}</span>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '2px', backgroundColor: palette.put }} />
              <span style={{ fontSize: '12px', fontWeight: 700, color: palette.put }}>{putCount}</span>
            </div>
          </div>
        )}

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
            {formatPerShare(perSharePremium)}
          </span>
          <span style={{ fontSize: '10px', color: palette.textMuted }}>/sh</span>
        </div>
      </div>
    </div>
  );
}
