'use client';

import React from 'react';
import { Receipt, CreditCard, Percent, MapPin, TrendingDown, Calendar } from 'lucide-react';

export type FeeType = 'commission' | 'credit_interest' | 'debit_interest' | 'locate_fee';

export interface FeesSummaryProps {
  feeType: FeeType;
  totalAmount: number;
  transactionCount: number;
  timePeriod: string;
  symbol?: string;
  breakdown?: Array<{
    date: string;
    amount: number;
    symbol?: string;
  }>;
}

const formatCurrency = (value: number) => {
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
  });
};

const getTitle = (feeType: FeeType, symbol?: string): string => {
  switch (feeType) {
    case 'commission': return 'Trading Commissions';
    case 'credit_interest': return 'Credit Interest Earned';
    case 'debit_interest': return 'Debit Interest Paid';
    case 'locate_fee': return symbol ? `Locate Fees for ${symbol}` : 'Locate Fees';
    default: return 'Fees & Interest';
  }
};

const getIcon = (feeType: FeeType) => {
  switch (feeType) {
    case 'commission': return Receipt;
    case 'credit_interest': return Percent;
    case 'debit_interest': return TrendingDown;
    case 'locate_fee': return MapPin;
    default: return CreditCard;
  }
};

const getAccentColor = (feeType: FeeType): string => {
  switch (feeType) {
    case 'commission': return 'text-orange-400';
    case 'credit_interest': return 'text-emerald-400';
    case 'debit_interest': return 'text-red-400';
    case 'locate_fee': return 'text-purple-400';
    default: return 'text-slate-400';
  }
};

const getBgAccent = (feeType: FeeType): string => {
  switch (feeType) {
    case 'commission': return 'bg-orange-500/10';
    case 'credit_interest': return 'bg-emerald-500/10';
    case 'debit_interest': return 'bg-red-500/10';
    case 'locate_fee': return 'bg-purple-500/10';
    default: return 'bg-slate-500/10';
  }
};

const getDescription = (feeType: FeeType): string => {
  switch (feeType) {
    case 'commission': return 'Total commissions paid on trades';
    case 'credit_interest': return 'Interest earned on credit balance';
    case 'debit_interest': return 'Interest paid on margin/debit';
    case 'locate_fee': return 'Fees for borrowing stock to short';
    default: return '';
  }
};

export function FeesSummary({ feeType, totalAmount, transactionCount, timePeriod, symbol, breakdown }: FeesSummaryProps) {
  const Icon = getIcon(feeType);
  const title = getTitle(feeType, symbol);
  const accentColor = getAccentColor(feeType);
  const bgAccent = getBgAccent(feeType);
  const description = getDescription(feeType);

  return (
    <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Icon className={`w-5 h-5 ${accentColor}`} />
          {title}
        </h3>
        <span className="text-sm text-slate-400 flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {timePeriod}
        </span>
      </div>

      {/* Main Amount Display */}
      <div className={`${bgAccent} rounded-lg p-4 border border-slate-600 mb-4`}>
        <div className="text-center">
          <p className={`text-3xl font-bold ${accentColor}`}>{formatCurrency(totalAmount)}</p>
          <p className="text-sm text-slate-400 mt-1">{description}</p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-600">
          <span className="text-xs text-slate-400 uppercase tracking-wider">Transactions</span>
          <p className="text-xl font-bold text-white mt-1">{transactionCount}</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-600">
          <span className="text-xs text-slate-400 uppercase tracking-wider">Average</span>
          <p className="text-xl font-bold text-white mt-1">
            {transactionCount > 0 ? formatCurrency(totalAmount / transactionCount) : '-'}
          </p>
        </div>
      </div>

      {/* Recent Breakdown */}
      {breakdown && breakdown.length > 0 && (
        <div className="border-t border-slate-700 pt-4">
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Recent Transactions</p>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {breakdown.slice(0, 5).map((item, index) => (
              <div key={index} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">{formatDate(item.date)}</span>
                  {item.symbol && (
                    <span className="text-xs bg-slate-700 px-2 py-0.5 rounded text-slate-300">
                      {item.symbol}
                    </span>
                  )}
                </div>
                <span className={accentColor}>{formatCurrency(item.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
