/**
 * CompanyOverviewCard
 *
 * Displays company fundamental data including:
 * - Company name, sector, industry
 * - Market cap, P/E ratio, EPS
 * - 52-week high/low, dividend yield
 * - Company description
 */

'use client';

import React from 'react';

interface CompanyOverviewData {
  type: 'company-overview';
  symbol: string;
  name: string;
  description: string;
  exchange: string;
  sector: string;
  industry: string;
  marketCap: number;
  peRatio: number | null;
  eps: number | null;
  dividendYield: number | null;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  beta: number | null;
}

interface CompanyOverviewCardProps {
  data: CompanyOverviewData;
}

// Format large numbers with suffixes
function formatLargeNumber(num: number): string {
  if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}

// Format currency
function formatCurrency(value: number | null): string {
  if (value === null) return 'N/A';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Format percentage
function formatPercentage(value: number | null): string {
  if (value === null) return 'N/A';
  return (value * 100).toFixed(2) + '%';
}

// Metric row component
function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '8px 0',
      borderBottom: '1px solid #1a1a1a',
    }}>
      <span style={{ color: '#888', fontSize: '13px' }}>{label}</span>
      <span style={{
        color: color || '#fff',
        fontSize: '14px',
        fontWeight: 600,
        fontFamily: 'monospace',
      }}>
        {value}
      </span>
    </div>
  );
}

export function CompanyOverviewCard({ data }: CompanyOverviewCardProps) {
  const {
    symbol,
    name,
    description,
    exchange,
    sector,
    industry,
    marketCap,
    peRatio,
    eps,
    dividendYield,
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow,
    beta,
  } = data;

  // Truncate description for display
  const shortDescription = description.length > 300
    ? description.substring(0, 300) + '...'
    : description;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0a0a0a 0%, #111 100%)',
      border: '1px solid #222',
      borderRadius: '12px',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      maxWidth: '500px',
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
            gap: '10px',
            marginBottom: '4px',
          }}>
            <span style={{
              fontSize: '24px',
              fontWeight: 700,
              color: '#00d4ff',
              fontFamily: 'monospace',
            }}>
              {symbol}
            </span>
            <span style={{
              fontSize: '11px',
              color: '#666',
              background: '#1a1a1a',
              padding: '2px 8px',
              borderRadius: '4px',
            }}>
              {exchange}
            </span>
          </div>
          <div style={{
            fontSize: '16px',
            color: '#fff',
            marginBottom: '4px',
          }}>
            {name}
          </div>
          <div style={{
            fontSize: '12px',
            color: '#666',
          }}>
            {sector} • {industry}
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        marginBottom: '16px',
      }}>
        {/* Market Cap */}
        <div style={{
          background: '#0f0f0f',
          borderRadius: '8px',
          padding: '12px',
          border: '1px solid #1a1a1a',
        }}>
          <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
            MARKET CAP
          </div>
          <div style={{
            fontSize: '20px',
            fontWeight: 700,
            color: '#00ff88',
            fontFamily: 'monospace',
          }}>
            ${formatLargeNumber(marketCap)}
          </div>
        </div>

        {/* P/E Ratio */}
        <div style={{
          background: '#0f0f0f',
          borderRadius: '8px',
          padding: '12px',
          border: '1px solid #1a1a1a',
        }}>
          <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
            P/E RATIO
          </div>
          <div style={{
            fontSize: '20px',
            fontWeight: 700,
            color: peRatio !== null ? '#fff' : '#444',
            fontFamily: 'monospace',
          }}>
            {peRatio !== null ? peRatio.toFixed(2) : 'N/A'}
          </div>
        </div>
      </div>

      {/* Metrics List */}
      <div style={{
        background: '#0a0a0a',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '16px',
        border: '1px solid #1a1a1a',
      }}>
        <MetricRow
          label="Earnings Per Share (EPS)"
          value={formatCurrency(eps)}
          color={eps !== null && eps > 0 ? '#00ff88' : eps !== null && eps < 0 ? '#ff4466' : '#666'}
        />
        <MetricRow
          label="Dividend Yield"
          value={formatPercentage(dividendYield)}
          color={dividendYield !== null && dividendYield > 0 ? '#ffd700' : '#666'}
        />
        <MetricRow
          label="52-Week High"
          value={formatCurrency(fiftyTwoWeekHigh)}
          color="#00ff88"
        />
        <MetricRow
          label="52-Week Low"
          value={formatCurrency(fiftyTwoWeekLow)}
          color="#ff4466"
        />
        <MetricRow
          label="Beta"
          value={beta !== null ? beta.toFixed(2) : 'N/A'}
        />
      </div>

      {/* Description */}
      <div style={{
        fontSize: '12px',
        color: '#888',
        lineHeight: '1.5',
        padding: '12px',
        background: '#0a0a0a',
        borderRadius: '8px',
        border: '1px solid #1a1a1a',
      }}>
        {shortDescription}
      </div>

      {/* Footer */}
      <div style={{
        marginTop: '12px',
        fontSize: '10px',
        color: '#444',
        textAlign: 'center',
      }}>
        Data provided by Alpha Vantage
      </div>
    </div>
  );
}

export default CompanyOverviewCard;
