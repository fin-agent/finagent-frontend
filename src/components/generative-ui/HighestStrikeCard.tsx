'use client';

import React from 'react';
import { Award, Calendar, Target, DollarSign, Layers } from 'lucide-react';

interface HighestStrikeCardProps {
  symbol: string;
  strike: number;
  callPut: 'Call' | 'Put';
  tradeType: 'buy' | 'sell';
  date: string;
  expiration: string;
  contracts: number;
  premium: number;
  isHighest?: boolean;
  datePreformatted?: boolean;
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
  goldDim: 'rgba(255, 215, 0, 0.12)',
  goldGlow: 'rgba(255, 215, 0, 0.4)',
};

export function HighestStrikeCard({
  symbol,
  strike,
  callPut,
  tradeType,
  date,
  expiration,
  contracts,
  premium,
  isHighest = true,
  datePreformatted = false,
}: HighestStrikeCardProps) {
  const displayDate = datePreformatted ? date : formatDate(date);
  const displayExpiration = datePreformatted ? expiration : formatDate(expiration);
  const isSell = tradeType === 'sell';
  const isCall = callPut === 'Call';
  const shares = contracts * 100;

  // Colors based on highest/lowest and trade type
  const accentColor = isHighest ? palette.gold : palette.profit;
  const accentDim = isHighest ? palette.goldDim : palette.profitDim;
  const accentGlow = isHighest ? palette.goldGlow : palette.profitGlow;
  const premiumColor = isSell ? palette.profit : palette.loss;
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
          <Award size={20} color={accentColor} strokeWidth={2} />
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
              {isHighest ? 'HIGHEST' : 'LOWEST'} STRIKE
            </span>
            <span style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: isSell ? palette.profitDim : palette.lossDim,
              color: isSell ? palette.profit : palette.loss,
              fontWeight: 600,
            }}>
              {isSell ? 'SELL' : 'BUY'}
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
              {symbol}
            </span>
            <span style={{
              fontSize: '18px',
              fontWeight: 800,
              color: accentColor,
              textShadow: `0 0 20px ${accentGlow}`,
            }}>
              ${strike.toLocaleString()}
            </span>
            <span style={{
              fontSize: '11px',
              color: palette.textMuted,
            }}>
              {displayDate}
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
          }}>
            {isSell ? 'Received' : 'Paid'}
          </div>
          <div style={{
            fontSize: '22px',
            fontWeight: 800,
            color: premiumColor,
            lineHeight: 1,
          }}>
            {formatCurrency(premium)}
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
          { icon: Layers, label: 'Contracts', value: contracts.toString() },
          { icon: Target, label: 'Shares', value: shares.toLocaleString() },
          { icon: Calendar, label: 'Expires', value: displayExpiration },
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

        {/* Per Contract Pill */}
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
            {formatCurrency(contracts > 0 ? premium / contracts : premium)}
          </span>
          <span style={{ fontSize: '10px', color: palette.textMuted }}>/ct</span>
        </div>
      </div>
    </div>
  );
}
