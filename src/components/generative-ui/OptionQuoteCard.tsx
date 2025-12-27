/**
 * OptionQuoteCard
 *
 * Displays real-time option quote data including:
 * - Bid/Ask/Mid prices with sizes
 * - Spread information
 * - Last trade price
 * - Greeks (delta, gamma, theta, vega)
 * - Implied volatility
 */

'use client';

import React from 'react';

interface OptionQuoteData {
  type: 'option-quote';
  occSymbol: string;
  displayName: string;
  underlying: string;
  expiration: string;
  strike: number;
  optionType: 'call' | 'put';
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  mid: number;
  spread: number;
  last: number | null;
  lastSize: number | null;
  volume?: number;
  openInterest?: number;
  impliedVolatility?: number;
  greeks?: {
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
  };
  timestamp: string;
}

interface OptionQuoteCardProps {
  data: OptionQuoteData;
}

// Format currency
function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/A';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Format date for display
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Format time for display
function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export function OptionQuoteCard({ data }: OptionQuoteCardProps) {
  const {
    displayName,
    underlying,
    expiration,
    strike,
    optionType,
    bid,
    bidSize,
    ask,
    askSize,
    mid,
    spread,
    last,
    lastSize,
    volume,
    openInterest,
    impliedVolatility,
    greeks,
    timestamp,
  } = data;

  // Call = blue accent, Put = pink accent
  const accentColor = optionType === 'call' ? '#00d4ff' : '#ff66b2';
  const typeLabel = optionType === 'call' ? 'CALL' : 'PUT';

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0a0a0a 0%, #111 100%)',
      border: '1px solid #222',
      borderRadius: '12px',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      maxWidth: '420px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '16px',
      }}>
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '4px',
          }}>
            <span style={{
              fontSize: '20px',
              fontWeight: 700,
              color: accentColor,
              fontFamily: 'monospace',
            }}>
              {underlying}
            </span>
            <span style={{
              fontSize: '11px',
              color: accentColor,
              background: `${accentColor}20`,
              padding: '2px 8px',
              borderRadius: '4px',
              fontWeight: 600,
            }}>
              {typeLabel}
            </span>
          </div>
          <div style={{
            fontSize: '14px',
            color: '#888',
          }}>
            ${strike.toFixed(2)} • Exp {formatDate(expiration)}
          </div>
        </div>
        <div style={{
          textAlign: 'right',
        }}>
          <div style={{
            fontSize: '11px',
            color: '#444',
          }}>
            {formatTime(timestamp)}
          </div>
        </div>
      </div>

      {/* NBBO Display */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        gap: '8px',
        marginBottom: '16px',
        alignItems: 'center',
      }}>
        {/* Bid */}
        <div style={{
          background: '#0f0f0f',
          borderRadius: '8px',
          padding: '12px',
          border: '1px solid #1a1a1a',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '11px', color: '#00ff88', marginBottom: '4px' }}>
            BID
          </div>
          <div style={{
            fontSize: '18px',
            fontWeight: 700,
            color: '#00ff88',
            fontFamily: 'monospace',
          }}>
            {formatCurrency(bid)}
          </div>
          <div style={{ fontSize: '11px', color: '#666' }}>
            {bidSize} contracts
          </div>
        </div>

        {/* Spread */}
        <div style={{
          textAlign: 'center',
          padding: '8px',
        }}>
          <div style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>
            SPREAD
          </div>
          <div style={{
            fontSize: '14px',
            color: '#ffd700',
            fontFamily: 'monospace',
          }}>
            {formatCurrency(spread)}
          </div>
        </div>

        {/* Ask */}
        <div style={{
          background: '#0f0f0f',
          borderRadius: '8px',
          padding: '12px',
          border: '1px solid #1a1a1a',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '11px', color: '#ff4466', marginBottom: '4px' }}>
            ASK
          </div>
          <div style={{
            fontSize: '18px',
            fontWeight: 700,
            color: '#ff4466',
            fontFamily: 'monospace',
          }}>
            {formatCurrency(ask)}
          </div>
          <div style={{ fontSize: '11px', color: '#666' }}>
            {askSize} contracts
          </div>
        </div>
      </div>

      {/* Mid Price & Last Trade */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        marginBottom: '16px',
      }}>
        <div style={{
          background: '#0f0f0f',
          borderRadius: '8px',
          padding: '12px',
          border: '1px solid #1a1a1a',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
            MID PRICE
          </div>
          <div style={{
            fontSize: '20px',
            fontWeight: 700,
            color: '#fff',
            fontFamily: 'monospace',
          }}>
            {formatCurrency(mid)}
          </div>
        </div>

        <div style={{
          background: '#0f0f0f',
          borderRadius: '8px',
          padding: '12px',
          border: '1px solid #1a1a1a',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
            LAST TRADE
          </div>
          <div style={{
            fontSize: '20px',
            fontWeight: 700,
            color: last !== null ? '#fff' : '#444',
            fontFamily: 'monospace',
          }}>
            {formatCurrency(last)}
          </div>
          {lastSize !== null && (
            <div style={{ fontSize: '11px', color: '#666' }}>
              {lastSize} contracts
            </div>
          )}
        </div>
      </div>

      {/* Greeks */}
      {greeks && (
        <div style={{
          background: '#0a0a0a',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '16px',
          border: '1px solid #1a1a1a',
        }}>
          <div style={{
            fontSize: '11px',
            color: '#666',
            marginBottom: '8px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Greeks
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '8px',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: '#666' }}>Delta</div>
              <div style={{
                fontSize: '14px',
                color: greeks.delta !== undefined ? '#00d4ff' : '#444',
                fontFamily: 'monospace',
              }}>
                {greeks.delta !== undefined ? greeks.delta.toFixed(3) : 'N/A'}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: '#666' }}>Gamma</div>
              <div style={{
                fontSize: '14px',
                color: greeks.gamma !== undefined ? '#00ff88' : '#444',
                fontFamily: 'monospace',
              }}>
                {greeks.gamma !== undefined ? greeks.gamma.toFixed(4) : 'N/A'}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: '#666' }}>Theta</div>
              <div style={{
                fontSize: '14px',
                color: greeks.theta !== undefined ? '#ff4466' : '#444',
                fontFamily: 'monospace',
              }}>
                {greeks.theta !== undefined ? greeks.theta.toFixed(4) : 'N/A'}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: '#666' }}>Vega</div>
              <div style={{
                fontSize: '14px',
                color: greeks.vega !== undefined ? '#ffd700' : '#444',
                fontFamily: 'monospace',
              }}>
                {greeks.vega !== undefined ? greeks.vega.toFixed(4) : 'N/A'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Implied Volatility & Volume */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: impliedVolatility !== undefined ? '1fr 1fr 1fr' : '1fr 1fr',
        gap: '8px',
      }}>
        {impliedVolatility !== undefined && (
          <div style={{
            background: '#0f0f0f',
            borderRadius: '6px',
            padding: '8px',
            textAlign: 'center',
            border: '1px solid #1a1a1a',
          }}>
            <div style={{ fontSize: '10px', color: '#666' }}>IV</div>
            <div style={{
              fontSize: '14px',
              color: '#ffd700',
              fontFamily: 'monospace',
            }}>
              {(impliedVolatility * 100).toFixed(1)}%
            </div>
          </div>
        )}
        {volume !== undefined && (
          <div style={{
            background: '#0f0f0f',
            borderRadius: '6px',
            padding: '8px',
            textAlign: 'center',
            border: '1px solid #1a1a1a',
          }}>
            <div style={{ fontSize: '10px', color: '#666' }}>Volume</div>
            <div style={{
              fontSize: '14px',
              color: '#fff',
              fontFamily: 'monospace',
            }}>
              {volume.toLocaleString()}
            </div>
          </div>
        )}
        {openInterest !== undefined && (
          <div style={{
            background: '#0f0f0f',
            borderRadius: '6px',
            padding: '8px',
            textAlign: 'center',
            border: '1px solid #1a1a1a',
          }}>
            <div style={{ fontSize: '10px', color: '#666' }}>OI</div>
            <div style={{
              fontSize: '14px',
              color: '#fff',
              fontFamily: 'monospace',
            }}>
              {openInterest.toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {/* Display name footer */}
      <div style={{
        marginTop: '12px',
        fontSize: '10px',
        color: '#444',
        textAlign: 'center',
        fontFamily: 'monospace',
      }}>
        {displayName}
      </div>
    </div>
  );
}

export default OptionQuoteCard;
