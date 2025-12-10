'use client';

import React from 'react';
import { Search, Calendar, TrendingUp, TrendingDown, Activity, Target, Clock, Hash } from 'lucide-react';

interface TradeQueryCardProps {
  query: string;
  filters: {
    fromDate?: string;
    toDate?: string;
    fromTime?: string;
    toTime?: string;
    symbol?: string;
    securityType?: 'Stock' | 'Option' | string;
    tradeType?: 'Buy' | 'Sell' | string;
    quantity?: number;
    strike?: number;
    callPut?: 'Call' | 'Put' | string;
    expiration?: string;
  };
}

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }
  return dateStr;
};

export function TradeQueryCard({ query, filters }: TradeQueryCardProps) {
  // Only show filters that have values
  const activeFilters = [
    {
      key: 'dateRange',
      label: 'Date Range',
      value: filters.fromDate || filters.toDate
        ? `${formatDate(filters.fromDate || '')}${filters.fromDate && filters.toDate ? ' → ' : ''}${formatDate(filters.toDate || '')}`
        : '',
      icon: Calendar,
      color: '#60a5fa'
    },
    {
      key: 'symbol',
      label: 'Symbol',
      value: filters.symbol || '',
      icon: Activity,
      color: '#00c806',
      highlight: true
    },
    {
      key: 'securityType',
      label: 'Type',
      value: filters.securityType || '',
      icon: Target,
      color: '#a78bfa'
    },
    {
      key: 'tradeType',
      label: 'Direction',
      value: filters.tradeType || '',
      icon: filters.tradeType === 'Buy' ? TrendingUp : TrendingDown,
      color: filters.tradeType === 'Buy' ? '#00c806' : '#f87171'
    },
    {
      key: 'callPut',
      label: 'Option Type',
      value: filters.callPut || '',
      icon: Activity,
      color: filters.callPut === 'Call' ? '#34d399' : '#fb923c'
    },
    {
      key: 'strike',
      label: 'Strike',
      value: filters.strike ? `$${filters.strike.toFixed(2)}` : '',
      icon: Hash,
      color: '#fbbf24'
    },
    {
      key: 'expiration',
      label: 'Expiration',
      value: formatDate(filters.expiration || ''),
      icon: Clock,
      color: '#f472b6'
    },
    {
      key: 'quantity',
      label: 'Quantity',
      value: filters.quantity ? filters.quantity.toString() : '',
      icon: Hash,
      color: '#94a3b8'
    },
  ].filter(f => f.value);

  // Time filters (rarely used, show separately if present)
  const hasTimeFilters = filters.fromTime || filters.toTime;

  return (
    <div style={styles.container}>
      {/* Gradient overlay for depth */}
      <div style={styles.gradientOverlay} />

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.iconWrapper}>
            <Search size={16} color="#00c806" />
          </div>
          <div style={styles.headerText}>
            <span style={styles.headerLabel}>Query Filter</span>
            <span style={styles.headerCount}>{activeFilters.length} active</span>
          </div>
        </div>
        <div style={styles.headerBadge}>
          <div style={styles.pulsingDot} />
          <span>Applied</span>
        </div>
      </div>

      {/* Query Text */}
      <div style={styles.querySection}>
        <p style={styles.queryText}>{query}</p>
      </div>

      {/* Active Filters Grid */}
      <div style={styles.filtersGrid}>
        {activeFilters.map((filter) => {
          const IconComponent = filter.icon;
          return (
            <div
              key={filter.key}
              style={{
                ...styles.filterCard,
                ...(filter.highlight ? styles.filterCardHighlight : {}),
              }}
            >
              <div style={styles.filterHeader}>
                <IconComponent
                  size={12}
                  color={filter.color}
                  style={{ opacity: 0.9 }}
                />
                <span style={styles.filterLabel}>{filter.label}</span>
              </div>
              <div
                style={{
                  ...styles.filterValue,
                  color: filter.highlight ? '#00c806' : '#ffffff',
                }}
              >
                {filter.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time filters if present */}
      {hasTimeFilters && (
        <div style={styles.timeSection}>
          <Clock size={12} color="#64748b" />
          <span style={styles.timeText}>
            Time: {filters.fromTime || '00:00'} - {filters.toTime || '23:59'}
          </span>
        </div>
      )}

      {/* Bottom accent line */}
      <div style={styles.accentLine} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    backgroundColor: '#0f0f0f',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
    marginTop: '12px',
    marginBottom: '12px',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.03)',
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '120px',
    background: 'linear-gradient(180deg, rgba(0, 200, 6, 0.03) 0%, transparent 100%)',
    pointerEvents: 'none',
  },
  header: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  iconWrapper: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    backgroundColor: 'rgba(0, 200, 6, 0.1)',
    border: '1px solid rgba(0, 200, 6, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  headerLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#ffffff',
    letterSpacing: '-0.01em',
  },
  headerCount: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  headerBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '20px',
    backgroundColor: 'rgba(0, 200, 6, 0.08)',
    border: '1px solid rgba(0, 200, 6, 0.15)',
    fontSize: '11px',
    fontWeight: 600,
    color: '#00c806',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  pulsingDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#00c806',
    boxShadow: '0 0 8px rgba(0, 200, 6, 0.6)',
    animation: 'pulse 2s ease-in-out infinite',
  },
  querySection: {
    position: 'relative',
    padding: '20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
  },
  queryText: {
    fontSize: '17px',
    fontWeight: 500,
    color: '#e5e7eb',
    lineHeight: 1.5,
    margin: 0,
    letterSpacing: '-0.01em',
  },
  filtersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '8px',
    padding: '16px 20px',
  },
  filterCard: {
    padding: '12px 14px',
    borderRadius: '10px',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.04)',
    transition: 'all 0.2s ease',
  },
  filterCardHighlight: {
    backgroundColor: 'rgba(0, 200, 6, 0.05)',
    border: '1px solid rgba(0, 200, 6, 0.15)',
  },
  filterHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '6px',
  },
  filterLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  filterValue: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#ffffff',
    letterSpacing: '-0.01em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  timeSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    borderTop: '1px solid rgba(255, 255, 255, 0.04)',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  timeText: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#64748b',
  },
  accentLine: {
    height: '2px',
    background: 'linear-gradient(90deg, #00c806 0%, rgba(0, 200, 6, 0.3) 50%, transparent 100%)',
  },
};

// Add keyframes for pulsing animation
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.9); }
    }
  `;
  if (!document.querySelector('style[data-trade-query-card]')) {
    styleSheet.setAttribute('data-trade-query-card', 'true');
    document.head.appendChild(styleSheet);
  }
}
