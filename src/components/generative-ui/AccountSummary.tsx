'use client';

import React from 'react';
import { formatCalendarDate } from '@/src/lib/date-utils';

export type AccountQueryType = 'cash_balance' | 'buying_power' | 'account_summary' | 'nlv' |
                               'overnight_margin' | 'market_value' | 'debit_balances' | 'credit_balances';

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

const formatCurrency = (value: number | undefined, compact = false) => {
  if (value === undefined || value === null) return '—';
  if (compact && Math.abs(value) >= 1000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
};

const formatNumber = (value: number | undefined) => {
  if (value === undefined || value === null) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

    return (
      <div style={cardStyle}>
        <AccentLine color={accentColor} />
        <div style={headerStyle}>
          <h3 style={titleStyle}>
            {isDebit ? 'Debit Balance Trend' : 'Credit Balance Trend'}
          </h3>
          <span style={dateStyle}>{balanceTrend.period}</span>
        </div>

        <DataRow
          label="Average Balance"
          value={formatCurrency(balanceTrend.average)}
          valueColor={accentColor}
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
      </div>
    );
  }

  // Cash Balance View
  if (queryType === 'cash_balance') {
    return (
      <div style={cardStyle}>
        <AccentLine color={colors.green} />
        <div style={headerStyle}>
          <h3 style={titleStyle}>Cash Balance</h3>
          <span style={dateStyle}>{formatCalendarDate(date)}</span>
        </div>

        <div style={{ padding: '24px 18px', textAlign: 'center', borderBottom: `1px solid ${colors.border}` }}>
          <span style={{ fontSize: '10px', letterSpacing: '0.1em', color: colors.textMuted, textTransform: 'uppercase' }}>Available Cash</span>
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
      <div style={cardStyle}>
        <AccentLine color={colors.blue} />
        <div style={headerStyle}>
          <h3 style={titleStyle}>Day Trading Buying Power</h3>
          <span style={dateStyle}>{formatCalendarDate(date)}</span>
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
      <div style={cardStyle}>
        <AccentLine color={colors.gold} />
        <div style={headerStyle}>
          <h3 style={titleStyle}>Net Liquidation Value</h3>
          <span style={dateStyle}>{formatCalendarDate(date)}</span>
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
    const houseExcess = props.houseExcessDeficit || 0;
    const fedExcess = props.fedExcessDeficit || 0;

    return (
      <div style={cardStyle}>
        <AccentLine color={colors.purple} />
        <div style={headerStyle}>
          <h3 style={titleStyle}>Margin Status</h3>
          <span style={dateStyle}>{formatCalendarDate(date)}</span>
        </div>

        <SectionHeader title="House Requirement" color={colors.blue} />
        <DataRow
          label="Requirement"
          value={formatCurrency(props.houseRequirement)}
        />
        <DataRow
          label="Excess / Deficit"
          value={formatCurrency(houseExcess)}
          valueColor={houseExcess >= 0 ? colors.green : colors.red}
          indicator={houseExcess >= 0 ? 'positive' : 'negative'}
          isAlt
        />

        <SectionHeader title="Federal Requirement" color={colors.purple} />
        <DataRow
          label="Requirement"
          value={formatCurrency(props.fedRequirement)}
        />
        <DataRow
          label="Excess / Deficit"
          value={formatCurrency(fedExcess)}
          valueColor={fedExcess >= 0 ? colors.green : colors.red}
          indicator={fedExcess >= 0 ? 'positive' : 'negative'}
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
    const netStocks = stockLong + stockShort;
    const netOptions = optionsLong + optionsShort;

    return (
      <div style={cardStyle}>
        <AccentLine color={colors.blue} />
        <div style={headerStyle}>
          <h3 style={titleStyle}>Position Market Values</h3>
          <span style={dateStyle}>{formatCalendarDate(date)}</span>
        </div>

        <SectionHeader title="Stocks" color={colors.blue} />
        <DataRow label="Net Value" value={formatCurrency(netStocks)} valueColor={colors.white} />
        <DataRow label="Long" value={formatCurrency(stockLong)} valueColor={colors.green} isAlt />
        <DataRow label="Short" value={formatCurrency(stockShort)} valueColor={colors.red} />

        <SectionHeader title="Options" color={colors.purple} />
        <DataRow label="Net Value" value={formatCurrency(netOptions)} valueColor={colors.white} />
        <DataRow label="Long" value={formatCurrency(optionsLong)} valueColor={colors.green} isAlt />
        <DataRow label="Short" value={formatCurrency(optionsShort)} valueColor={colors.red} />
      </div>
    );
  }

  // Full Account Summary View (default) - Tabular Format
  return (
    <div style={cardStyle}>
      <AccentLine color={colors.accent} />
      <div style={headerStyle}>
        <h3 style={titleStyle}>Account Summary</h3>
        <span style={dateStyle}>{formatCalendarDate(date)}</span>
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
