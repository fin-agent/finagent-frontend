'use client';

import React from 'react';

interface DailyBalance {
  date: string;
  debitBalance: number;
}

interface DebitBalanceSummaryProps {
  accountCode: string;
  accountName: string;
  timePeriod: string;
  currentBalance: number;
  currentBalanceDate: string;
  average: number;
  highest: number;
  highestDate: string;
  lowest: number;
  lowestDate: string;
  dailyBalances: DailyBalance[];
}

export default function DebitBalanceSummary({
  accountName,
  timePeriod,
  currentBalance,
  currentBalanceDate,
  average,
  highest,
  highestDate,
  lowest,
  lowestDate,
  dailyBalances,
}: DebitBalanceSummaryProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatCompactCurrency = (value: number) => {
    if (value >= 1000) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    }
    return formatCurrency(value);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div style={{
      background: '#111',
      borderRadius: '16px',
      padding: '16px',
      color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      width: '100%',
      maxWidth: '320px',
      boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '16px',
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          background: 'linear-gradient(135deg, #ff9500 0%, #ff6b00 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
        }}>
          💳
        </div>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
            Debit Balance
          </div>
          <div style={{ fontSize: '11px', color: '#888' }}>
            {accountName} • {timePeriod}
          </div>
        </div>
      </div>

      {/* Current Balance - Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a1a 0%, #222 100%)',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '12px',
        border: '1px solid #333',
      }}>
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>
          Current Balance ({formatDate(currentBalanceDate)})
        </div>
        <div style={{
          fontSize: '28px',
          fontWeight: 700,
          color: '#ff9500',
          letterSpacing: '-0.5px',
        }}>
          {formatCurrency(currentBalance)}
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px',
        marginBottom: '12px',
      }}>
        {/* Average */}
        <div style={{
          background: '#1a1a1a',
          borderRadius: '10px',
          padding: '10px 8px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>Average</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#00d4ff' }}>
            {formatCompactCurrency(average)}
          </div>
        </div>

        {/* Highest */}
        <div style={{
          background: '#1a1a1a',
          borderRadius: '10px',
          padding: '10px 8px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>Highest</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#ff4466' }}>
            {formatCompactCurrency(highest)}
          </div>
          <div style={{ fontSize: '9px', color: '#555', marginTop: '2px' }}>
            {formatDate(highestDate)}
          </div>
        </div>

        {/* Lowest */}
        <div style={{
          background: '#1a1a1a',
          borderRadius: '10px',
          padding: '10px 8px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>Lowest</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#00ff88' }}>
            {formatCompactCurrency(lowest)}
          </div>
          <div style={{ fontSize: '9px', color: '#555', marginTop: '2px' }}>
            {formatDate(lowestDate)}
          </div>
        </div>
      </div>

      {/* Daily Breakdown - Compact */}
      <div style={{
        background: '#1a1a1a',
        borderRadius: '10px',
        padding: '10px',
      }}>
        <div style={{
          fontSize: '10px',
          color: '#666',
          marginBottom: '8px',
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          <span>Daily Breakdown</span>
          <span>{dailyBalances.length} days</span>
        </div>
        <div style={{
          maxHeight: '100px',
          overflowY: 'auto',
        }}>
          {dailyBalances.slice(-5).map((day) => {
            const isHighest = day.debitBalance === highest;
            const isLowest = day.debitBalance === lowest;
            const color = isHighest ? '#ff4466' : isLowest ? '#00ff88' : '#999';
            return (
              <div
                key={day.date}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '4px 0',
                  borderBottom: '1px solid #222',
                  fontSize: '11px',
                }}
              >
                <span style={{ color: '#666' }}>{formatDate(day.date)}</span>
                <span style={{ color, fontWeight: isHighest || isLowest ? 600 : 400 }}>
                  {formatCurrency(day.debitBalance)}
                  {isHighest && <span style={{ marginLeft: '4px', fontSize: '9px' }}>▲</span>}
                  {isLowest && <span style={{ marginLeft: '4px', fontSize: '9px' }}>▼</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
