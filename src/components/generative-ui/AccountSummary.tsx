'use client';

import React from 'react';
import { formatCalendarDate } from '@/src/lib/date-utils';

export type AccountQueryType = 'cash_balance' | 'buying_power' | 'account_summary' | 'nlv' |
                               'cash_and_equity' | 'overnight_margin' | 'market_value' | 'debit_balances' | 'credit_balances';

export interface AccountSummaryProps {
  queryType: AccountQueryType;
  date: string;
  cashBalance?: number;
  accountEquity?: number;
  dayTradingBP?: number;
  stockLMV?: number;
  stockSMV?: number;
  optionsLMV?: number;
  optionsSMV?: number;
  creditBalance?: number;
  debitBalance?: number;
  houseRequirement?: number;
  houseExcessDeficit?: number;
  fedRequirement?: number;
  fedExcessDeficit?: number;
  balanceTrend?: {
    average: number;
    highest: number;
    highestDate: string;
    lowest: number;
    lowestDate: string;
    period: string;
    entries?: Array<{ date: string; amount: number }>;
  };
}

// Refined financial terminal color palette
const colors = {
  bgCard: '#0c0c12',
  bgCardSecondary: '#101018',
  bgRow: '#0e0e16',
  bgRowAlt: '#12121c',
  bgRowHover: '#16161f',
  border: '#1e1e2a',
  borderAccent: '#2a2a3a',
  textMuted: '#4a4a5c',
  textLabel: '#6a6a7c',
  textValue: '#e8e8ec',
  textTitle: '#9a9aac',
  accent: '#00c806',
  gold: '#f0c674',
  green: '#4ade80',
  greenMuted: '#22c55e',
  blue: '#60a5fa',
  purple: '#a78bfa',
  red: '#f87171',
  redMuted: '#ef4444',
  white: '#ffffff',
};

const formatCurrency = (value: number | undefined) => {
  if (value === undefined || value === null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
};


// Card container style
const cardStyle: React.CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  borderRadius: '12px',
  background: colors.bgCard,
  border: `1px solid ${colors.border}`,
  boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
  fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
};

// Header style
const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 18px',
  borderBottom: `1px solid ${colors.border}`,
  background: `linear-gradient(180deg, ${colors.bgCardSecondary} 0%, ${colors.bgCard} 100%)`,
};

const titleStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: colors.textTitle,
  margin: 0,
};

const dateStyle: React.CSSProperties = {
  fontSize: '11px',
  letterSpacing: '0.05em',
  color: colors.textMuted,
};

// Data row style for tabular display
const dataRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 18px',
  borderBottom: `1px solid ${colors.border}`,
};

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: colors.textLabel,
};

const valueStyle: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 600,
  letterSpacing: '-0.01em',
  color: colors.textValue,
  textAlign: 'right',
};

// Hero value for featured metrics
const heroValueStyle = (color: string): React.CSSProperties => ({
  fontSize: '32px',
  fontWeight: 700,
  letterSpacing: '-0.02em',
  color: color,
  margin: 0,
});

// Decorative top accent line
const AccentLine = ({ color }: { color: string }) => (
  <div style={{
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '2px',
    background: `linear-gradient(90deg, transparent 0%, ${color} 50%, transparent 100%)`,
  }} />
);

// Status indicator
const StatusIndicator = ({ positive }: { positive?: boolean }) => (
  <span style={{
    display: 'inline-block',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    marginRight: '8px',
    backgroundColor: positive ? colors.green : colors.red,
    boxShadow: `0 0 6px ${positive ? colors.green : colors.red}40`,
  }} />
);

// Data Row Component
const DataRow = ({
  label,
  value,
  valueColor = colors.textValue,
  isAlt = false,
  indicator,
}: {
  label: string;
  value: string;
  valueColor?: string;
  isAlt?: boolean;
  indicator?: 'positive' | 'negative';
}) => (
  <div style={{
    ...dataRowStyle,
    background: isAlt ? colors.bgRowAlt : colors.bgRow,
  }}>
    <span style={labelStyle}>
      {indicator && <StatusIndicator positive={indicator === 'positive'} />}
      {label}
    </span>
    <span style={{ ...valueStyle, color: valueColor }}>{value}</span>
  </div>
);

// Section Header Component
const SectionHeader = ({ title, color }: { title: string; color: string }) => (
  <div style={{
    padding: '10px 18px',
    background: colors.bgCardSecondary,
    borderBottom: `1px solid ${colors.border}`,
    borderLeft: `3px solid ${color}`,
  }}>
    <span style={{
      fontSize: '10px',
      fontWeight: 600,
      letterSpacing: '0.15em',
      textTransform: 'uppercase',
      color: color,
    }}>{title}</span>
  </div>
);

export function AccountSummary(props: AccountSummaryProps) {
  const { queryType, date } = props;

  // Balance Trend View (for debit/credit balances)
  if ((queryType === 'debit_balances' || queryType === 'credit_balances') && props.balanceTrend) {
    const { balanceTrend } = props;
    const isDebit = queryType === 'debit_balances';
    const accentColor = isDebit ? colors.red : colors.green;

    // Get the specific date's balance (for single-date queries)
    const specificDateBalance = isDebit ? props.debitBalance : props.creditBalance;
    const hasSpecificDateBalance = specificDateBalance !== undefined && specificDateBalance !== null && date;
    const balanceLabel = isDebit ? 'Debit Balance' : 'Credit Balance';

    return (
      <div style={cardStyle} data-testid="account-summary-card" data-query-type={queryType}>
        <AccentLine color={accentColor} />
        <div style={headerStyle}>
          <h3 style={titleStyle}>
            {isDebit ? 'Debit Balance' : 'Credit Balance'}
          </h3>
          <span style={dateStyle} data-testid="account-card-header-right">{balanceTrend.period}</span>
        </div>

        {/* Featured Specific Date Balance - shown when a single date was queried */}
        {hasSpecificDateBalance && (
          <div style={{
            padding: '20px 18px',
            background: `linear-gradient(135deg, ${colors.bgCardSecondary} 0%, ${colors.bgCard} 100%)`,
            borderBottom: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: `linear-gradient(135deg, ${accentColor}15 0%, ${accentColor}08 100%)`,
                border: `1px solid ${accentColor}30`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 0 12px ${accentColor}10`,
              }}>
                <span style={{ fontSize: '18px' }}>{isDebit ? '📉' : '📈'}</span>
              </div>
              <div>
                <div style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: colors.textMuted,
                  marginBottom: '2px',
                }}>
                  {balanceLabel}
                </div>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: accentColor,
                  letterSpacing: '0.02em',
                }}>
                  {formatCalendarDate(date)}
                </div>
              </div>
            </div>
            <div style={{
              fontSize: '24px',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: accentColor,
              textShadow: `0 0 20px ${accentColor}30`,
            }}>
              {formatCurrency(specificDateBalance)}
            </div>
          </div>
        )}

        {/* Month Statistics Section */}
        <SectionHeader title={`${balanceTrend.period} Statistics`} color={accentColor} />
        <DataRow
          label="Average Balance"
          value={formatCurrency(balanceTrend.average)}
          valueColor={colors.textValue}
        />
        <DataRow
          label={`Highest (${formatCalendarDate(balanceTrend.highestDate)})`}
          value={formatCurrency(balanceTrend.highest)}
          isAlt
        />
        <DataRow
          label={`Lowest (${formatCalendarDate(balanceTrend.lowestDate)})`}
          value={formatCurrency(balanceTrend.lowest)}
        />

        {balanceTrend.entries && balanceTrend.entries.length > 0 && (
          <>
            <SectionHeader title="Daily Balances" color={accentColor} />
            <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
              {balanceTrend.entries.map((entry, idx) => (
                <DataRow
                  key={`${entry.date}-${idx}`}
                  label={formatCalendarDate(entry.date)}
                  value={formatCurrency(entry.amount)}
                  isAlt={idx % 2 === 1}
                />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // Cash Balance View
  if (queryType === 'cash_balance') {
    return (
      <div style={cardStyle} data-testid="account-summary-card" data-query-type={queryType}>
        <AccentLine color={colors.green} />
        <div style={headerStyle}>
          <h3 style={titleStyle}>Cash Balance</h3>
          <span style={dateStyle} data-testid="account-card-header-right">{formatCalendarDate(date)}</span>
        </div>

        <div style={{ padding: '24px 18px', textAlign: 'center', borderBottom: `1px solid ${colors.border}` }}>
          <span style={{ fontSize: '10px', letterSpacing: '0.1em', color: colors.textMuted, textTransform: 'uppercase' }}>Available Cash</span>
          <p style={{ ...heroValueStyle(colors.green), marginTop: '8px' }}>
            {formatCurrency(props.cashBalance)}
          </p>
        </div>
      </div>
    );
  }

  // Cash + Equity View
  if (queryType === 'cash_and_equity') {
    return (
      <div style={cardStyle} data-testid="account-summary-card" data-query-type={queryType}>
        <AccentLine color={colors.gold} />
        <div style={headerStyle}>
          <h3 style={titleStyle}>Cash & Equity</h3>
          <span style={dateStyle} data-testid="account-card-header-right">{formatCalendarDate(date)}</span>
        </div>

        <div style={{ padding: '24px 18px', textAlign: 'center', borderBottom: `1px solid ${colors.border}` }}>
          <span style={{ fontSize: '10px', letterSpacing: '0.1em', color: colors.textMuted, textTransform: 'uppercase' }}>Cash Balance</span>
          <p style={{ ...heroValueStyle(colors.green), marginTop: '8px' }}>
            {formatCurrency(props.cashBalance)}
          </p>
        </div>

        <DataRow
          label="Account Equity"
          value={formatCurrency(props.accountEquity)}
          valueColor={colors.gold}
        />
      </div>
    );
  }

  // Buying Power View
  if (queryType === 'buying_power') {
    return (
      <div style={cardStyle} data-testid="account-summary-card" data-query-type={queryType}>
        <AccentLine color={colors.blue} />
        <div style={headerStyle}>
          <h3 style={titleStyle}>Day Trading Buying Power</h3>
          <span style={dateStyle} data-testid="account-card-header-right">{formatCalendarDate(date)}</span>
        </div>

        <div style={{ padding: '24px 18px', textAlign: 'center' }}>
          <span style={{ fontSize: '10px', letterSpacing: '0.1em', color: colors.textMuted, textTransform: 'uppercase' }}>Available</span>
          <p style={{ ...heroValueStyle(colors.blue), marginTop: '8px' }}>
            {formatCurrency(props.dayTradingBP)}
          </p>
          <p style={{ marginTop: '12px', color: colors.textMuted, fontSize: '11px' }}>
            Maximum capital for intraday positions
          </p>
        </div>
      </div>
    );
  }

  // NLV View
  if (queryType === 'nlv') {
    return (
      <div style={cardStyle} data-testid="account-summary-card" data-query-type={queryType}>
        <AccentLine color={colors.gold} />
        <div style={headerStyle}>
          <h3 style={titleStyle}>Net Liquidation Value</h3>
          <span style={dateStyle} data-testid="account-card-header-right">{formatCalendarDate(date)}</span>
        </div>

        <div style={{ padding: '24px 18px', textAlign: 'center' }}>
          <span style={{ fontSize: '10px', letterSpacing: '0.1em', color: colors.textMuted, textTransform: 'uppercase' }}>NLV</span>
          <p style={{ ...heroValueStyle(colors.gold), marginTop: '8px' }}>
            {formatCurrency(props.accountEquity)}
          </p>
          <p style={{ marginTop: '12px', color: colors.textMuted, fontSize: '11px' }}>
            Total account value if all positions were liquidated
          </p>
        </div>
      </div>
    );
  }

  // Margin Status View
  if (queryType === 'overnight_margin') {
    const houseExcessDeficit = props.houseExcessDeficit || 0;
    const isExcess = houseExcessDeficit >= 0;
    const label = isExcess ? 'House Excess' : 'House Deficit';
    const displayValue = Math.abs(houseExcessDeficit);

    return (
      <div style={cardStyle} data-testid="account-summary-card" data-query-type={queryType}>
        <AccentLine color={colors.purple} />
        <div style={headerStyle}>
          <h3 style={titleStyle}>Overnight Margin</h3>
          <span style={dateStyle} data-testid="account-card-header-right">{formatCalendarDate(date)}</span>
        </div>

        <SectionHeader title="House Requirement" color={colors.blue} />
        <DataRow
          label="Requirement"
          value={formatCurrency(props.houseRequirement)}
        />
        <DataRow
          label={label}
          value={formatCurrency(displayValue)}
          valueColor={isExcess ? colors.green : colors.red}
          indicator={isExcess ? 'positive' : 'negative'}
          isAlt
        />
      </div>
    );
  }

  // Market Value View
  if (queryType === 'market_value') {
    const stockLong = props.stockLMV || 0;
    const stockShort = props.stockSMV || 0;
    const optionsLong = props.optionsLMV || 0;
    const optionsShort = props.optionsSMV || 0;

    return (
      <div style={cardStyle} data-testid="account-summary-card" data-query-type={queryType}>
        <AccentLine color={colors.blue} />
        <div style={headerStyle}>
          <h3 style={titleStyle}>Position Market Values</h3>
          <span style={dateStyle} data-testid="account-card-header-right">{formatCalendarDate(date)}</span>
        </div>

        <SectionHeader title="Market Value of Positions" color={colors.blue} />
        <DataRow label="Long Stock" value={formatCurrency(stockLong)} valueColor={colors.green} />
        <DataRow label="Long Options" value={formatCurrency(optionsLong)} valueColor={colors.green} isAlt />
        <DataRow label="Short Stock" value={formatCurrency(stockShort)} valueColor={colors.red} />
        <DataRow label="Short Options" value={formatCurrency(optionsShort)} valueColor={colors.red} isAlt />
      </div>
    );
  }

  // Full Account Summary View (default) - Tabular Format
  return (
    <div style={cardStyle} data-testid="account-summary-card" data-query-type={queryType}>
      <AccentLine color={colors.accent} />
      <div style={headerStyle}>
        <h3 style={titleStyle}>Account Summary</h3>
        <span style={dateStyle} data-testid="account-card-header-right">{formatCalendarDate(date)}</span>
      </div>

      {/* Primary Metrics Section */}
      <SectionHeader title="Account Balances" color={colors.accent} />
      <DataRow
        label="Cash Balance"
        value={formatCurrency(props.cashBalance)}
        valueColor={colors.green}
      />
      <DataRow
        label="Account Equity"
        value={formatCurrency(props.accountEquity)}
        valueColor={colors.gold}
        isAlt
      />
      <DataRow
        label="Day Trading BP"
        value={formatCurrency(props.dayTradingBP)}
        valueColor={colors.blue}
      />

      {/* Position Values Section */}
      <SectionHeader title="Position Values" color={colors.purple} />
      <DataRow
        label="Stock Long"
        value={formatCurrency(props.stockLMV)}
        valueColor={colors.green}
      />
      <DataRow
        label="Stock Short"
        value={formatCurrency(props.stockSMV)}
        valueColor={colors.red}
        isAlt
      />
      <DataRow
        label="Options Long"
        value={formatCurrency(props.optionsLMV)}
        valueColor={colors.green}
      />
      <DataRow
        label="Options Short"
        value={formatCurrency(props.optionsSMV)}
        valueColor={colors.red}
        isAlt
      />
    </div>
  );
}
