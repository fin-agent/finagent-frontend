'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Calendar, ChevronDown, Play, Filter, Zap } from 'lucide-react';

interface QueryFilters {
  symbol: string;
  securityType: 'all' | 'S' | 'O';
  tradeType: 'all' | 'B' | 'S';
  callPut: 'all' | 'C' | 'P';
  fromDate: string;
  toDate: string;
  expiration: string;
  strike: string;
}

interface QueryBuilderProps {
  onExecute: (filters: QueryFilters) => void;
  onClose: () => void;
  isLoading?: boolean;
}

const SYMBOLS = [
  'AAPL', 'GOOGL', 'TSLA', 'AMZN', 'MSFT', 'NVDA', 'META', 'NFLX', 'AMD', 'INTC',
  'SPY', 'QQQ', 'GME', 'QCOM', 'BAC',
];

const DATE_PRESETS = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last Week', value: 'last week' },
  { label: 'Last Month', value: 'last month' },
  { label: 'YTD', value: 'this year' },
  { label: 'Last 12 Mo', value: 'last 12 months' },
];

const EXPIRATION_PRESETS = [
  { label: 'Tomorrow', value: 'tomorrow' },
  { label: 'This Week', value: 'this week' },
  { label: 'This Month', value: 'this month' },
];

export function QueryBuilder({ onExecute, onClose, isLoading = false }: QueryBuilderProps) {
  const [filters, setFilters] = useState<QueryFilters>({
    symbol: '',
    securityType: 'all',
    tradeType: 'all',
    callPut: 'all',
    fromDate: '',
    toDate: '',
    expiration: '',
    strike: '',
  });

  const [queryPreview, setQueryPreview] = useState('All trades');
  const [symbolDropdownOpen, setSymbolDropdownOpen] = useState(false);
  const [filteredSymbols, setFilteredSymbols] = useState(SYMBOLS);

  // Generate human-readable query preview
  const generatePreview = useCallback((f: QueryFilters): string => {
    const parts: string[] = [];

    // Trade direction
    if (f.tradeType === 'B') parts.push('Bought');
    else if (f.tradeType === 'S') parts.push('Sold');

    // Call/Put
    if (f.securityType === 'O' && f.callPut !== 'all') {
      parts.push(f.callPut === 'C' ? 'call' : 'put');
      parts.push('options');
    } else if (f.securityType === 'O') {
      parts.push('options');
    } else if (f.securityType === 'S') {
      parts.push('stocks');
    } else {
      parts.push('trades');
    }

    // Symbol
    if (f.symbol) {
      parts.push(`on ${f.symbol}`);
    }

    // Strike
    if (f.strike) {
      parts.push(`at $${f.strike} strike`);
    }

    // Date range
    if (f.fromDate && f.toDate) {
      parts.push(`from ${f.fromDate} to ${f.toDate}`);
    } else if (f.fromDate) {
      parts.push(`since ${f.fromDate}`);
    } else if (f.toDate) {
      parts.push(`until ${f.toDate}`);
    }

    // Expiration
    if (f.expiration) {
      parts.push(`expiring ${f.expiration}`);
    }

    return parts.length > 0 ? parts.join(' ') : 'All trades';
  }, []);

  useEffect(() => {
    setQueryPreview(generatePreview(filters));
  }, [filters, generatePreview]);

  const handleSymbolSearch = (value: string) => {
    setFilters(f => ({ ...f, symbol: value.toUpperCase() }));
    const filtered = SYMBOLS.filter(s =>
      s.toLowerCase().includes(value.toLowerCase())
    );
    setFilteredSymbols(filtered);
    setSymbolDropdownOpen(value.length > 0 && filtered.length > 0);
  };

  const selectSymbol = (symbol: string) => {
    setFilters(f => ({ ...f, symbol }));
    setSymbolDropdownOpen(false);
  };

  const handleExecute = () => {
    onExecute(filters);
  };

  const hasFilters = filters.symbol || filters.securityType !== 'all' ||
    filters.tradeType !== 'all' || filters.callPut !== 'all' ||
    filters.fromDate || filters.toDate || filters.expiration || filters.strike;

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <Filter size={18} style={{ color: '#00c806' }} />
            <span style={styles.headerTitle}>QUERY BUILDER</span>
          </div>
          <button onClick={onClose} style={styles.closeButton}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {/* Row 1: Symbol, Type, Direction */}
          <div style={styles.row}>
            {/* Symbol */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>SYMBOL</label>
              <div style={styles.inputWrapper}>
                <Search size={14} style={styles.inputIcon} />
                <input
                  type="text"
                  placeholder="AAPL"
                  value={filters.symbol}
                  onChange={(e) => handleSymbolSearch(e.target.value)}
                  onFocus={() => setSymbolDropdownOpen(filteredSymbols.length > 0)}
                  onBlur={() => setTimeout(() => setSymbolDropdownOpen(false), 150)}
                  style={styles.input}
                />
                {symbolDropdownOpen && (
                  <div style={styles.dropdown}>
                    {filteredSymbols.slice(0, 6).map(s => (
                      <button
                        key={s}
                        onClick={() => selectSymbol(s)}
                        style={styles.dropdownItem}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Security Type */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>TYPE</label>
              <div style={styles.radioGroup}>
                {[
                  { value: 'all', label: 'All' },
                  { value: 'O', label: 'Options' },
                  { value: 'S', label: 'Stocks' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFilters(f => ({
                      ...f,
                      securityType: opt.value as 'all' | 'S' | 'O',
                      callPut: opt.value !== 'O' ? 'all' : f.callPut,
                    }))}
                    style={{
                      ...styles.radioButton,
                      ...(filters.securityType === opt.value ? styles.radioButtonActive : {}),
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Trade Direction */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>DIRECTION</label>
              <div style={styles.radioGroup}>
                {[
                  { value: 'all', label: 'All' },
                  { value: 'B', label: 'Buy', color: '#00c806' },
                  { value: 'S', label: 'Sell', color: '#ff5252' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFilters(f => ({ ...f, tradeType: opt.value as 'all' | 'B' | 'S' }))}
                    style={{
                      ...styles.radioButton,
                      ...(filters.tradeType === opt.value ? {
                        ...styles.radioButtonActive,
                        borderColor: opt.color || '#00c806',
                        color: opt.color || '#00c806',
                      } : {}),
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Date Range + Option Filters */}
          <div style={styles.row}>
            {/* Date Range */}
            <div style={{ ...styles.fieldGroup, flex: 1.5 }}>
              <label style={styles.label}>DATE RANGE</label>
              <div style={styles.dateRow}>
                <div style={styles.dateInputWrapper}>
                  <Calendar size={14} style={styles.inputIcon} />
                  <input
                    type="text"
                    placeholder="From date"
                    value={filters.fromDate}
                    onChange={(e) => setFilters(f => ({ ...f, fromDate: e.target.value }))}
                    style={styles.dateInput}
                  />
                </div>
                <span style={styles.dateSeparator}></span>
                <div style={styles.dateInputWrapper}>
                  <input
                    type="text"
                    placeholder="To date"
                    value={filters.toDate}
                    onChange={(e) => setFilters(f => ({ ...f, toDate: e.target.value }))}
                    style={{ ...styles.dateInput, paddingLeft: '12px' }}
                  />
                </div>
              </div>
              <div style={styles.presetRow}>
                {DATE_PRESETS.map(preset => (
                  <button
                    key={preset.value}
                    onClick={() => setFilters(f => ({ ...f, fromDate: preset.value, toDate: '' }))}
                    style={{
                      ...styles.presetButton,
                      ...(filters.fromDate === preset.value ? styles.presetButtonActive : {}),
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Option-specific filters */}
            {filters.securityType !== 'S' && (
              <div style={{ ...styles.fieldGroup, flex: 1 }}>
                <label style={styles.label}>OPTION FILTERS</label>
                {/* Call/Put */}
                <div style={styles.radioGroup}>
                  {[
                    { value: 'all', label: 'All' },
                    { value: 'C', label: 'Call', color: '#4da6ff' },
                    { value: 'P', label: 'Put', color: '#ffa64d' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setFilters(f => ({ ...f, callPut: opt.value as 'all' | 'C' | 'P' }))}
                      style={{
                        ...styles.radioButton,
                        ...(filters.callPut === opt.value ? {
                          ...styles.radioButtonActive,
                          borderColor: opt.color || '#00c806',
                          color: opt.color || '#00c806',
                        } : {}),
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Strike */}
                <div style={styles.smallInputRow}>
                  <label style={styles.smallLabel}>Strike $</label>
                  <input
                    type="number"
                    placeholder="250"
                    value={filters.strike}
                    onChange={(e) => setFilters(f => ({ ...f, strike: e.target.value }))}
                    style={styles.smallInput}
                  />
                </div>

                {/* Expiration */}
                <div style={styles.smallInputRow}>
                  <label style={styles.smallLabel}>Exp</label>
                  <div style={styles.expirationWrapper}>
                    <input
                      type="text"
                      placeholder="tomorrow"
                      value={filters.expiration}
                      onChange={(e) => setFilters(f => ({ ...f, expiration: e.target.value }))}
                      style={styles.smallInput}
                    />
                    <ChevronDown size={14} style={{ color: '#5a5a5c' }} />
                  </div>
                </div>
                <div style={styles.presetRow}>
                  {EXPIRATION_PRESETS.map(preset => (
                    <button
                      key={preset.value}
                      onClick={() => setFilters(f => ({ ...f, expiration: preset.value }))}
                      style={{
                        ...styles.presetButton,
                        fontSize: '10px',
                        ...(filters.expiration === preset.value ? styles.presetButtonActive : {}),
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Query Preview */}
          <div style={styles.previewSection}>
            <label style={styles.previewLabel}>
              <Zap size={12} style={{ marginRight: '6px', color: '#00c806' }} />
              QUERY PREVIEW
            </label>
            <div style={styles.previewBox}>
              <span style={styles.previewText}>{queryPreview}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button
            onClick={handleExecute}
            disabled={isLoading}
            style={{
              ...styles.executeButton,
              ...(isLoading ? styles.executeButtonDisabled : {}),
              ...(!hasFilters ? { opacity: 0.7 } : {}),
            }}
          >
            {isLoading ? (
              <span style={styles.loadingText}>Executing...</span>
            ) : (
              <>
                <Play size={16} fill="currentColor" />
                <span>EXECUTE QUERY</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  container: {
    backgroundColor: '#0a0a0a',
    borderRadius: '16px',
    border: '1px solid #1f1f1f',
    width: '100%',
    maxWidth: '680px',
    maxHeight: '90vh',
    overflow: 'hidden',
    boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid #1f1f1f',
    backgroundColor: '#0f0f0f',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  headerTitle: {
    fontFamily: '"JetBrains Mono", "IBM Plex Mono", monospace',
    fontSize: '13px',
    fontWeight: 600,
    color: '#ffffff',
    letterSpacing: '1px',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#5a5a5c',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
  },
  body: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  row: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
  },
  fieldGroup: {
    flex: 1,
    minWidth: '140px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '10px',
    fontWeight: 600,
    color: '#5a5a5c',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  },
  inputWrapper: {
    position: 'relative',
  },
  inputIcon: {
    position: 'absolute',
    left: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#5a5a5c',
  },
  input: {
    width: '100%',
    padding: '10px 12px 10px 36px',
    backgroundColor: '#141414',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    color: '#ffffff',
    fontSize: '14px',
    fontFamily: '"JetBrains Mono", monospace',
    outline: 'none',
    transition: 'border-color 0.15s ease',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: '4px',
    backgroundColor: '#141414',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    overflow: 'hidden',
    zIndex: 10,
  },
  dropdownItem: {
    display: 'block',
    width: '100%',
    padding: '10px 12px',
    background: 'none',
    border: 'none',
    color: '#8c8c8e',
    fontSize: '13px',
    fontFamily: '"JetBrains Mono", monospace',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'background-color 0.1s ease',
  },
  radioGroup: {
    display: 'flex',
    gap: '6px',
  },
  radioButton: {
    flex: 1,
    padding: '8px 12px',
    backgroundColor: '#141414',
    border: '1px solid #2a2a2a',
    borderRadius: '6px',
    color: '#8c8c8e',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  radioButtonActive: {
    borderColor: '#00c806',
    color: '#00c806',
    backgroundColor: 'rgba(0, 200, 6, 0.1)',
  },
  dateRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  dateInputWrapper: {
    flex: 1,
    position: 'relative',
  },
  dateInput: {
    width: '100%',
    padding: '10px 12px 10px 36px',
    backgroundColor: '#141414',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    color: '#ffffff',
    fontSize: '13px',
    fontFamily: '"JetBrains Mono", monospace',
    outline: 'none',
  },
  dateSeparator: {
    width: '16px',
    height: '2px',
    backgroundColor: '#2a2a2a',
    borderRadius: '1px',
  },
  presetRow: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
    marginTop: '6px',
  },
  presetButton: {
    padding: '4px 10px',
    backgroundColor: 'transparent',
    border: '1px solid #2a2a2a',
    borderRadius: '12px',
    color: '#5a5a5c',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  presetButtonActive: {
    borderColor: '#00c806',
    color: '#00c806',
    backgroundColor: 'rgba(0, 200, 6, 0.1)',
  },
  smallInputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '8px',
  },
  smallLabel: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '11px',
    color: '#5a5a5c',
    minWidth: '50px',
  },
  smallInput: {
    flex: 1,
    padding: '8px 10px',
    backgroundColor: '#141414',
    border: '1px solid #2a2a2a',
    borderRadius: '6px',
    color: '#ffffff',
    fontSize: '13px',
    fontFamily: '"JetBrains Mono", monospace',
    outline: 'none',
  },
  expirationWrapper: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  previewSection: {
    marginTop: '8px',
  },
  previewLabel: {
    display: 'flex',
    alignItems: 'center',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '10px',
    fontWeight: 600,
    color: '#5a5a5c',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    marginBottom: '8px',
  },
  previewBox: {
    padding: '14px 16px',
    backgroundColor: '#141414',
    border: '1px solid #1f1f1f',
    borderRadius: '8px',
    borderLeft: '3px solid #00c806',
  },
  previewText: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    color: '#ffffff',
    lineHeight: 1.5,
  },
  footer: {
    padding: '16px 20px',
    borderTop: '1px solid #1f1f1f',
    backgroundColor: '#0f0f0f',
    display: 'flex',
    justifyContent: 'center',
  },
  executeButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 32px',
    backgroundColor: '#00c806',
    border: 'none',
    borderRadius: '8px',
    color: '#000000',
    fontSize: '13px',
    fontFamily: '"JetBrains Mono", monospace',
    fontWeight: 600,
    letterSpacing: '0.5px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: '0 0 20px rgba(0, 200, 6, 0.3)',
  },
  executeButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
  loadingText: {
    fontFamily: '"JetBrains Mono", monospace',
  },
};

export default QueryBuilder;
