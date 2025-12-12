'use client';

import React from 'react';
import { Wallet, TrendingUp, TrendingDown, BarChart3, Shield, DollarSign, ArrowUpRight, ArrowDownRight } from 'lucide-react';

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

const formatCurrency = (value: number | undefined) => {
  if (value === undefined || value === null) return '-';
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
    year: 'numeric',
  });
};

const getTitle = (queryType: AccountQueryType): string => {
  switch (queryType) {
    case 'cash_balance': return 'Cash Balance';
    case 'buying_power': return 'Day Trading Buying Power';
    case 'nlv': return 'Net Liquidation Value';
    case 'overnight_margin': return 'Margin Status';
    case 'market_value': return 'Position Market Values';
    case 'debit_balances': return 'Debit Balance Trend';
    case 'credit_balances': return 'Credit Balance Trend';
    case 'account_summary':
    default: return 'Account Summary';
  }
};

const getIcon = (queryType: AccountQueryType) => {
  switch (queryType) {
    case 'cash_balance': return Wallet;
    case 'buying_power': return TrendingUp;
    case 'nlv': return DollarSign;
    case 'overnight_margin': return Shield;
    case 'market_value': return BarChart3;
    case 'debit_balances':
    case 'credit_balances': return TrendingDown;
    default: return Wallet;
  }
};

export function AccountSummary(props: AccountSummaryProps) {
  const { queryType, date } = props;
  const Icon = getIcon(queryType);
  const title = getTitle(queryType);

  // Balance Trend View (for debit/credit balances)
  if ((queryType === 'debit_balances' || queryType === 'credit_balances') && props.balanceTrend) {
    const { balanceTrend } = props;
    const isDebit = queryType === 'debit_balances';
    const accentColor = isDebit ? 'text-red-400' : 'text-emerald-400';
    const bgAccent = isDebit ? 'bg-red-500/10' : 'bg-emerald-500/10';

    return (
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Icon className={`w-5 h-5 ${accentColor}`} />
            {title}
          </h3>
          <span className="text-sm text-slate-400">{balanceTrend.period}</span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className={`${bgAccent} rounded-lg p-4 border border-slate-600`}>
            <span className="text-xs text-slate-400 uppercase tracking-wider">Average</span>
            <p className={`text-xl font-bold ${accentColor} mt-1`}>{formatCurrency(balanceTrend.average)}</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
            <span className="text-xs text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" /> Highest
            </span>
            <p className="text-xl font-bold text-white mt-1">{formatCurrency(balanceTrend.highest)}</p>
            <p className="text-xs text-slate-500 mt-1">{formatDate(balanceTrend.highestDate)}</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
            <span className="text-xs text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <ArrowDownRight className="w-3 h-3" /> Lowest
            </span>
            <p className="text-xl font-bold text-white mt-1">{formatCurrency(balanceTrend.lowest)}</p>
            <p className="text-xs text-slate-500 mt-1">{formatDate(balanceTrend.lowestDate)}</p>
          </div>
        </div>
      </div>
    );
  }

  // Cash Balance View
  if (queryType === 'cash_balance') {
    return (
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-400" />
            {title}
          </h3>
          <span className="text-sm text-slate-400">As of {formatDate(date)}</span>
        </div>
        <div className="text-center py-4">
          <p className="text-4xl font-bold text-emerald-400">{formatCurrency(props.cashBalance)}</p>
          <p className="text-sm text-slate-400 mt-2">Account Equity: {formatCurrency(props.accountEquity)}</p>
        </div>
      </div>
    );
  }

  // Buying Power View
  if (queryType === 'buying_power') {
    return (
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            {title}
          </h3>
          <span className="text-sm text-slate-400">As of {formatDate(date)}</span>
        </div>
        <div className="text-center py-4">
          <p className="text-4xl font-bold text-blue-400">{formatCurrency(props.dayTradingBP)}</p>
          <p className="text-sm text-slate-400 mt-2">Available for day trading</p>
        </div>
      </div>
    );
  }

  // NLV View
  if (queryType === 'nlv') {
    return (
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            {title}
          </h3>
          <span className="text-sm text-slate-400">As of {formatDate(date)}</span>
        </div>
        <div className="text-center py-4">
          <p className="text-4xl font-bold text-emerald-400">{formatCurrency(props.accountEquity)}</p>
          <p className="text-sm text-slate-400 mt-2">Total Account Equity</p>
        </div>
      </div>
    );
  }

  // Margin Status View
  if (queryType === 'overnight_margin') {
    return (
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-yellow-400" />
            {title}
          </h3>
          <span className="text-sm text-slate-400">As of {formatDate(date)}</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
            <span className="text-xs text-slate-400 uppercase tracking-wider">House Requirement</span>
            <p className="text-xl font-bold text-white mt-1">{formatCurrency(props.houseRequirement)}</p>
            <span className="text-xs text-slate-400">Excess/Deficit:</span>
            <p className={`text-sm font-semibold ${(props.houseExcessDeficit || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatCurrency(props.houseExcessDeficit)}
            </p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
            <span className="text-xs text-slate-400 uppercase tracking-wider">Federal Requirement</span>
            <p className="text-xl font-bold text-white mt-1">{formatCurrency(props.fedRequirement)}</p>
            <span className="text-xs text-slate-400">Excess/Deficit:</span>
            <p className={`text-sm font-semibold ${(props.fedExcessDeficit || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatCurrency(props.fedExcessDeficit)}
            </p>
          </div>
        </div>
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
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-purple-400" />
            {title}
          </h3>
          <span className="text-sm text-slate-400">As of {formatDate(date)}</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
            <span className="text-xs text-slate-400 uppercase tracking-wider">Stocks</span>
            <p className="text-xl font-bold text-white mt-1">{formatCurrency(netStocks)}</p>
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-emerald-400">Long:</span>
                <span className="text-slate-300">{formatCurrency(stockLong)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-red-400">Short:</span>
                <span className="text-slate-300">{formatCurrency(stockShort)}</span>
              </div>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
            <span className="text-xs text-slate-400 uppercase tracking-wider">Options</span>
            <p className="text-xl font-bold text-white mt-1">{formatCurrency(netOptions)}</p>
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-emerald-400">Long:</span>
                <span className="text-slate-300">{formatCurrency(optionsLong)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-red-400">Short:</span>
                <span className="text-slate-300">{formatCurrency(optionsShort)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Full Account Summary View (default)
  return (
    <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Wallet className="w-5 h-5 text-emerald-400" />
          {title}
        </h3>
        <span className="text-sm text-slate-400">As of {formatDate(date)}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-emerald-500/10 rounded-lg p-3 border border-slate-600">
          <span className="text-xs text-slate-400 uppercase tracking-wider">Cash Balance</span>
          <p className="text-lg font-bold text-emerald-400 mt-1">{formatCurrency(props.cashBalance)}</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-600">
          <span className="text-xs text-slate-400 uppercase tracking-wider">Account Equity</span>
          <p className="text-lg font-bold text-white mt-1">{formatCurrency(props.accountEquity)}</p>
        </div>
        <div className="bg-blue-500/10 rounded-lg p-3 border border-slate-600">
          <span className="text-xs text-slate-400 uppercase tracking-wider">Day Trading BP</span>
          <p className="text-lg font-bold text-blue-400 mt-1">{formatCurrency(props.dayTradingBP)}</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-600">
          <span className="text-xs text-slate-400 uppercase tracking-wider">Stock Long</span>
          <p className="text-lg font-bold text-white mt-1">{formatCurrency(props.stockLMV)}</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-600">
          <span className="text-xs text-slate-400 uppercase tracking-wider">Stock Short</span>
          <p className="text-lg font-bold text-white mt-1">{formatCurrency(props.stockSMV)}</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-600">
          <span className="text-xs text-slate-400 uppercase tracking-wider">Options Long</span>
          <p className="text-lg font-bold text-white mt-1">{formatCurrency(props.optionsLMV)}</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-600">
          <span className="text-xs text-slate-400 uppercase tracking-wider">Options Short</span>
          <p className="text-lg font-bold text-white mt-1">{formatCurrency(props.optionsSMV)}</p>
        </div>
      </div>
    </div>
  );
}
