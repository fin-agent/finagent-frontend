'use client';

import React from 'react';
import { TrendingUp } from 'lucide-react';

interface TradeSummaryProps {
  symbol: string;
  stockCount: number;
  optionCount: number;
}

export function TradeSummary({ symbol, stockCount, optionCount }: TradeSummaryProps) {
  const totalTrades = stockCount + optionCount;

  return (
    <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-emerald-400" />
          Trades for {symbol}
        </h3>
        <span className="text-sm text-slate-400">
          {totalTrades} total trade{totalTrades !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-blue-400"></div>
            <span className="text-sm text-slate-400">Stock Trades</span>
          </div>
          <p className="text-2xl font-bold text-white">{stockCount}</p>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-purple-400"></div>
            <span className="text-sm text-slate-400">Option Trades</span>
          </div>
          <p className="text-2xl font-bold text-white">{optionCount}</p>
        </div>
      </div>
    </div>
  );
}
