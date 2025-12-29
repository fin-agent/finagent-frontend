'use client';

import React from 'react';
import { TrendingUp, TrendingDown, BarChart3, Layers, Calendar, DollarSign } from 'lucide-react';

interface OptionStatsProps {
  symbol: string;
  year: number;
  tradeType: 'buy' | 'sell' | 'all';
  timePeriod?: string | null;
  highestPremium: number;
  highestPremiumDate: string;
  highestPremiumContracts: number;
  highestPremiumStrike: number;
  highestPremiumCallPut: 'Call' | 'Put';
  lowestPremium: number;
  lowestPremiumDate: string;
  lowestPremiumContracts: number;
  lowestPremiumStrike: number;
  lowestPremiumCallPut: 'Call' | 'Put';
  averagePremium: number;
  totalTrades: number;
  totalContracts: number;
  totalValue: number;
  callCount: number;
  putCount: number;
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
  call: '#00d4ff',
  callDim: 'rgba(0, 212, 255, 0.12)',
  put: '#ff66b2',
  putDim: 'rgba(255, 102, 178, 0.12)',
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

export function OptionStats({
  symbol,
  year,
  tradeType,
  timePeriod,
  highestPremium,
  highestPremiumDate,
  highestPremiumContracts,
  highestPremiumStrike,
  highestPremiumCallPut,
  lowestPremium,
  lowestPremiumDate,
  lowestPremiumContracts,
  lowestPremiumStrike,
  lowestPremiumCallPut,
  averagePremium,
  totalTrades,
  totalContracts,
  totalValue,
  callCount,
  putCount,
}: OptionStatsProps) {
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
          <BarChart3 size={20} color={palette.purple} strokeWidth={2} />
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
              OPTION STATS
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

        {/* Average Premium - Hero Number */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontSize: '9px',
            color: palette.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '2px',
          }}>
            Avg Premium
          </div>
          <div style={{
            fontSize: '22px',
            fontWeight: 800,
            color: palette.textPrimary,
            lineHeight: 1,
          }}>
            {formatCurrency(averagePremium)}
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
            {formatCurrency(highestPremium)}
          </div>
          <div style={{
            fontSize: '10px',
            color: palette.textMuted,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
          }}>
            <span style={{
              fontSize: '9px',
              fontWeight: 700,
              padding: '1px 4px',
              borderRadius: '3px',
              backgroundColor: highestPremiumCallPut === 'Call' ? palette.callDim : palette.putDim,
              color: highestPremiumCallPut === 'Call' ? palette.call : palette.put,
            }}>
              {highestPremiumCallPut === 'Call' ? 'C' : 'P'}
            </span>
            <span>${highestPremiumStrike}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Calendar size={10} />
              {formatDate(highestPremiumDate)}
            </span>
            <span>{highestPremiumContracts}x</span>
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
            {formatCurrency(lowestPremium)}
          </div>
          <div style={{
            fontSize: '10px',
            color: palette.textMuted,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
          }}>
            <span style={{
              fontSize: '9px',
              fontWeight: 700,
              padding: '1px 4px',
              borderRadius: '3px',
              backgroundColor: lowestPremiumCallPut === 'Call' ? palette.callDim : palette.putDim,
              color: lowestPremiumCallPut === 'Call' ? palette.call : palette.put,
            }}>
              {lowestPremiumCallPut === 'Call' ? 'C' : 'P'}
            </span>
            <span>${lowestPremiumStrike}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Calendar size={10} />
              {formatDate(lowestPremiumDate)}
            </span>
            <span>{lowestPremiumContracts}x</span>
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
