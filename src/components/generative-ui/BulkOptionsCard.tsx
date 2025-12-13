'use client';

import React, { useState } from 'react';
import { TrendingDown, TrendingUp, Zap, Target, Clock, ChevronDown, ChevronUp } from 'lucide-react';

interface OptionTrade {
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

const formatCompactCurrency = (value: number) => {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return formatCurrency(value);
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

export function BulkOptionsCard({ trades, symbol, callPut, tradeType, timePeriod, aggregations }: BulkOptionsCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isSell = tradeType === 'sell';
  const isCall = callPut === 'call';

  // Calculate totals from aggregations or trades
  const totalContracts = aggregations?.totalContracts ||
    trades.reduce((sum, t) => sum + parseFloat(t.OptionContracts || '0'), 0);
  const totalPremium = aggregations?.totalNetAmount || aggregations?.totalPremium ||
    trades.reduce((sum, t) => sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);
  const avgPremium = aggregations?.avgPremium || (totalContracts > 0 ? totalPremium / totalContracts / 100 : 0);
  const sharesCovered = aggregations?.sharesCovered || totalContracts * 100;
  const tradeCount = aggregations?.totalTrades || trades.length;

  // Group trades by strike for visual breakdown
  const strikeGroups = trades.reduce((acc, trade) => {
    const strike = trade.Strike || 'Unknown';
    if (!acc[strike]) {
      acc[strike] = { contracts: 0, premium: 0, count: 0 };
    }
    acc[strike].contracts += parseFloat(trade.OptionContracts || '0');
    acc[strike].premium += Math.abs(parseFloat(trade.NetAmount || '0'));
    acc[strike].count += 1;
    return acc;
  }, {} as Record<string, { contracts: number; premium: number; count: number }>);

  // Sort strikes by premium (highest first)
  const sortedStrikes = Object.entries(strikeGroups)
    .sort((a, b) => b[1].premium - a[1].premium);

  // Color scheme based on trade type
  const accentColor = isSell ? '#10b981' : '#f59e0b'; // Green for short (collecting), Amber for long (paying)
  const accentDim = isSell ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)';
  const callPutColor = isCall ? '#3b82f6' : '#ec4899'; // Blue for calls, Pink for puts

  return (
    <div style={{
      background: 'linear-gradient(180deg, #0f0f0f 0%, #0a0a0a 100%)',
      borderRadius: '20px',
      border: '1px solid #1f1f1f',
      overflow: 'hidden',
      marginTop: '12px',
      marginBottom: '12px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255,255,255,0.03)',
      fontFamily: '"SF Mono", "Fira Code", "JetBrains Mono", monospace',
    }}>

      {/* Header Strip */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 20px',
        background: `linear-gradient(90deg, ${accentDim} 0%, transparent 100%)`,
        borderBottom: '1px solid #1a1a1a',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}88 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 4px 16px ${accentColor}40`,
          }}>
            {isSell ? <TrendingDown size={20} color="#fff" strokeWidth={2.5} /> : <TrendingUp size={20} color="#fff" strokeWidth={2.5} />}
          </div>
          <div>
            <div style={{
              fontSize: '11px',
              fontWeight: 700,
              color: accentColor,
              textTransform: 'uppercase',
              letterSpacing: '1.2px',
              marginBottom: '2px',
            }}>
              {isSell ? 'SHORT' : 'LONG'} {isCall ? 'CALLS' : callPut === 'put' ? 'PUTS' : 'OPTIONS'}
            </div>
            <div style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#ffffff',
              letterSpacing: '-0.3px',
            }}>
              {symbol || 'All Symbols'} {timePeriod && `• ${timePeriod}`}
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{
            fontSize: '10px',
            fontWeight: 600,
            padding: '5px 12px',
            borderRadius: '20px',
            backgroundColor: callPutColor + '20',
            color: callPutColor,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            {isCall ? 'CALLS' : callPut === 'put' ? 'PUTS' : 'MIXED'}
          </span>
        </div>
      </div>

      {/* Hero Stats - Large Numbers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1px 1fr',
        gap: '0',
        padding: '24px 0',
        background: 'linear-gradient(180deg, #111111 0%, #0d0d0d 100%)',
      }}>
        {/* Total Contracts */}
        <div style={{ textAlign: 'center', padding: '0 20px' }}>
          <div style={{
            fontSize: '42px',
            fontWeight: 800,
            color: '#ffffff',
            lineHeight: 1,
            letterSpacing: '-2px',
            fontFamily: '"SF Pro Display", -apple-system, sans-serif',
          }}>
            {totalContracts.toLocaleString()}
          </div>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            color: '#666',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginTop: '8px',
          }}>
            CONTRACTS
          </div>
          <div style={{
            fontSize: '12px',
            color: '#555',
            marginTop: '4px',
          }}>
            {sharesCovered.toLocaleString()} shares
          </div>
        </div>

        {/* Divider */}
        <div style={{ backgroundColor: '#222', margin: '10px 0' }} />

        {/* Total Premium */}
        <div style={{ textAlign: 'center', padding: '0 20px' }}>
          <div style={{
            fontSize: '42px',
            fontWeight: 800,
            color: accentColor,
            lineHeight: 1,
            letterSpacing: '-2px',
            fontFamily: '"SF Pro Display", -apple-system, sans-serif',
            textShadow: `0 0 40px ${accentColor}40`,
          }}>
            {formatCompactCurrency(totalPremium)}
          </div>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            color: '#666',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginTop: '8px',
          }}>
            {isSell ? 'COLLECTED' : 'PAID'}
          </div>
          <div style={{
            fontSize: '12px',
            color: '#555',
            marginTop: '4px',
          }}>
            ${avgPremium.toFixed(2)}/share avg
          </div>
        </div>
      </div>

      {/* Quick Stats Bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        borderTop: '1px solid #1a1a1a',
        borderBottom: '1px solid #1a1a1a',
        backgroundColor: '#0c0c0c',
      }}>
        <div style={{
          padding: '14px 16px',
          textAlign: 'center',
          borderRight: '1px solid #1a1a1a',
        }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>{tradeCount}</div>
          <div style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Trades</div>
        </div>
        <div style={{
          padding: '14px 16px',
          textAlign: 'center',
          borderRight: '1px solid #1a1a1a',
        }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>{sortedStrikes.length}</div>
          <div style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Strikes</div>
        </div>
        <div style={{
          padding: '14px 16px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: callPutColor }}>
            {aggregations?.callCount || 0}<span style={{ color: '#444' }}>/</span>{aggregations?.putCount || 0}
          </div>
          <div style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>C / P</div>
        </div>
      </div>

      {/* Strike Breakdown - Horizontal Pills */}
      <div style={{
        padding: '16px 20px',
        backgroundColor: '#0a0a0a',
      }}>
        <div style={{
          fontSize: '10px',
          fontWeight: 600,
          color: '#555',
          textTransform: 'uppercase',
          letterSpacing: '0.8px',
          marginBottom: '12px',
        }}>
          By Strike Price
        </div>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
        }}>
          {sortedStrikes.slice(0, 6).map(([strike, data]) => (
            <div
              key={strike}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                backgroundColor: '#141414',
                borderRadius: '10px',
                border: '1px solid #222',
              }}
            >
              <Target size={12} color={callPutColor} />
              <span style={{
                fontSize: '13px',
                fontWeight: 700,
                color: '#fff',
              }}>
                ${parseFloat(strike).toFixed(0)}
              </span>
              <span style={{
                fontSize: '11px',
                color: '#666',
                borderLeft: '1px solid #333',
                paddingLeft: '8px',
              }}>
                {data.contracts}× {formatCompactCurrency(data.premium)}
              </span>
            </div>
          ))}
          {sortedStrikes.length > 6 && (
            <div style={{
              padding: '8px 14px',
              backgroundColor: '#111',
              borderRadius: '10px',
              fontSize: '11px',
              color: '#555',
            }}>
              +{sortedStrikes.length - 6} more
            </div>
          )}
        </div>
      </div>

      {/* Expandable Trade List */}
      <div style={{ borderTop: '1px solid #1a1a1a' }}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            width: '100%',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: '#888',
            fontSize: '12px',
            fontFamily: 'inherit',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={14} color={accentColor} />
            <span style={{ color: '#fff', fontWeight: 500 }}>View All Trades</span>
            <span style={{ color: '#555' }}>({trades.length})</span>
          </span>
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {isExpanded && (
          <div style={{
            borderTop: '1px solid #1a1a1a',
            maxHeight: '300px',
            overflowY: 'auto',
          }}>
            {trades.map((trade, i) => {
              const netAmount = Math.abs(parseFloat(trade.NetAmount || '0'));
              const contracts = parseFloat(trade.OptionContracts || '0');
              const strike = parseFloat(trade.Strike || '0');
              const isTradeCall = trade['Call/Put'] === 'C';

              return (
                <div
                  key={trade.TradeID}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 1fr 80px 100px',
                    alignItems: 'center',
                    padding: '12px 20px',
                    backgroundColor: i % 2 === 0 ? '#0c0c0c' : '#0a0a0a',
                    borderBottom: '1px solid #151515',
                    gap: '12px',
                  }}
                >
                  <div style={{
                    fontSize: '12px',
                    color: '#666',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}>
                    <Clock size={11} color="#444" />
                    {formatDate(trade.Date)}
                  </div>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#fff',
                  }}>
                    {trade.Symbol} ${strike.toFixed(0)} {isTradeCall ? 'Call' : 'Put'}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: '#888',
                    textAlign: 'right',
                  }}>
                    {contracts}×
                  </div>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: accentColor,
                    textAlign: 'right',
                  }}>
                    {formatCurrency(netAmount)}
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
