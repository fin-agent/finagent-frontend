'use client';

import React, { useState } from 'react';
import { TrendingUp, BarChart3, DollarSign, ChevronDown, ChevronUp, Calendar, Layers } from 'lucide-react';

interface Trade {
  securityType: string;
  buyDate: string;
  sellDate: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  profitLoss: number;
}

interface ProfitableTradesProps {
  symbol: string;
  totalProfitableTrades: number;
  totalProfit: number;
  trades: Trade[];
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

export function ProfitableTrades({
  symbol,
  totalProfitableTrades,
  totalProfit,
  trades,
}: ProfitableTradesProps) {
  const [showDetails, setShowDetails] = useState(false);

  const avgProfit = totalProfitableTrades > 0 ? totalProfit / totalProfitableTrades : 0;
  const totalQty = trades.reduce((sum, t) => sum + t.quantity, 0);
  const stockTrades = trades.filter(t => t.securityType === 'Stock').length;
  const optionTrades = trades.filter(t => t.securityType !== 'Stock').length;

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
        background: `radial-gradient(ellipse at left, ${palette.profitDim} 0%, transparent 50%)`,
      }}>
        {/* Icon */}
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '12px',
          background: `linear-gradient(135deg, ${palette.profit}20 0%, ${palette.profit}05 100%)`,
          border: `1px solid ${palette.profit}30`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <TrendingUp size={20} color={palette.profit} strokeWidth={2} />
        </div>

        {/* Main Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
            <span style={{
              fontSize: '9px',
              fontWeight: 700,
              color: palette.profit,
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
            }}>
              PROFITABLE TRADES
            </span>
            <span style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: palette.profitDim,
              color: palette.profit,
              fontWeight: 600,
            }}>
              +{totalProfitableTrades}
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
              {totalQty.toLocaleString()} units
            </span>
          </div>
        </div>

        {/* Total Profit - Hero Number */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontSize: '9px',
            color: palette.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '2px',
          }}>
            Total Profit
          </div>
          <div style={{
            fontSize: '24px',
            fontWeight: 800,
            color: palette.profit,
            lineHeight: 1,
            textShadow: `0 0 30px ${palette.profitGlow}`,
          }}>
            {formatCurrency(totalProfit)}
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
          { icon: BarChart3, label: 'Trades', value: totalProfitableTrades.toString() },
          { icon: Layers, label: 'Units', value: totalQty.toLocaleString() },
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

        {/* Stock/Option breakdown */}
        {(stockTrades > 0 || optionTrades > 0) && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            {stockTrades > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                <span style={{ fontSize: '10px', color: palette.textMuted }}>S</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: palette.textSecondary }}>{stockTrades}</span>
              </div>
            )}
            {optionTrades > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                <span style={{ fontSize: '10px', color: palette.textMuted }}>O</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: palette.textSecondary }}>{optionTrades}</span>
              </div>
            )}
          </div>
        )}

        {/* Avg Profit Pill */}
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
          <span style={{ fontSize: '12px', fontWeight: 700, color: palette.profit }}>
            {formatCurrency(avgProfit)}
          </span>
          <span style={{ fontSize: '10px', color: palette.textMuted }}>/avg</span>
        </div>
      </div>

      {/* Show Details Toggle */}
      {trades.length > 0 && (
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
      )}

      {/* Trade Details */}
      {showDetails && trades.length > 0 && (
        <div style={{
          borderTop: `1px solid ${palette.border}`,
          maxHeight: '250px',
          overflowY: 'auto',
        }}>
          {trades.slice(0, 5).map((trade, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 20px',
                backgroundColor: index % 2 === 0 ? palette.surface : palette.void,
                borderBottom: `1px solid ${palette.border}`,
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '2px 4px',
                    borderRadius: '3px',
                    backgroundColor: trade.securityType === 'Stock' ? palette.elevated : palette.profitDim,
                    color: trade.securityType === 'Stock' ? palette.textSecondary : palette.profit,
                  }}>
                    {trade.securityType === 'Stock' ? 'STK' : 'OPT'}
                  </span>
                  <span style={{
                    fontSize: '11px',
                    color: palette.textSecondary,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                    <Calendar size={10} />
                    {formatDate(trade.buyDate)} → {formatDate(trade.sellDate)}
                  </span>
                </div>
                <div style={{
                  fontSize: '10px',
                  color: palette.textMuted,
                }}>
                  {trade.quantity} × {formatCurrency(trade.buyPrice)} → {formatCurrency(trade.sellPrice)}
                </div>
              </div>
              <div style={{
                fontSize: '13px',
                fontWeight: 700,
                color: trade.profitLoss >= 0 ? palette.profit : palette.loss,
                whiteSpace: 'nowrap',
              }}>
                +{formatCurrency(trade.profitLoss)}
              </div>
            </div>
          ))}
          {trades.length > 5 && (
            <div style={{
              padding: '8px 20px',
              fontSize: '10px',
              color: palette.textDim,
              textAlign: 'center',
              backgroundColor: palette.void,
            }}>
              +{trades.length - 5} more trades
            </div>
          )}
        </div>
      )}
    </div>
  );
}
