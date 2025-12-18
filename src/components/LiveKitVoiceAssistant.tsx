'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import {
  LiveKitRoom,
  useVoiceAssistant,
  BarVisualizer,
  RoomAudioRenderer,
  VoiceAssistantControlBar,
  AgentState,
  useTranscriptions,
  useLocalParticipant,
  useRoomContext,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Mic, MessageSquare, X, Phone, Loader2, Plus, History, Send } from 'lucide-react';

// Import UI card components
import { TradesTable } from './generative-ui/TradesTable';
import { TradeSummary } from './generative-ui/TradeSummary';
import { TradeStats } from './generative-ui/TradeStats';
import { OptionStats } from './generative-ui/OptionStats';
import { ProfitableTrades } from './generative-ui/ProfitableTrades';
import { TimeBasedTrades } from './generative-ui/TimeBasedTrades';
import { AveragePrice } from './generative-ui/AveragePrice';
import { BulkOptionsCard } from './generative-ui/BulkOptionsCard';
import { HighestStrikeCard } from './generative-ui/HighestStrikeCard';
import { TotalPremiumCard } from './generative-ui/TotalPremiumCard';
import { ExpiringOptionsTable } from './generative-ui/ExpiringOptionsTable';
import { LastOptionTradeCard } from './generative-ui/LastOptionTradeCard';
import { AccountSummary, type AccountQueryType } from './generative-ui/AccountSummary';
import { FeesSummary, type FeeType } from './generative-ui/FeesSummary';

// Types
type InputMode = 'voice' | 'text';
type View = 'chat' | 'history';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ConnectionDetails {
  serverUrl: string;
  roomName: string;
  participantToken: string;
  participantName: string;
}

interface TranscriptMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  tradeUI?: TradeUIData;
  isFinal?: boolean;
}

type CardType = 'summary' | 'detailed' | 'stats' | 'profitable' | 'time-based' | 'option-stats' | 'average-price' | 'advanced-options' | 'highest-strike' | 'total-premium' | 'expiring-options' | 'last-option' | 'account-balance' | 'fees';

interface TradeUIData {
  type: CardType;
  symbol: string;
  tradeType?: 'buy' | 'sell' | 'all';
  timePeriod?: string;
  callPut?: 'call' | 'put';
  expiration?: string;
  data: unknown;
  optionData?: unknown;
  accountQueryType?: AccountQueryType;
  feeType?: FeeType;
}

// Type for option trades from API
interface OptionTrade {
  TradeID: number;
  Date: string;
  Symbol: string;
  SecurityType?: string;
  TradeType: string;
  Strike?: string;
  Expiration?: string;
  'Call/Put'?: string;
  OptionContracts?: string;
  OptionTradePremium?: string;
  NetAmount: string;
}

// Type for expiring options from API
interface ExpiringOption {
  TradeID: number;
  Date: string;
  Symbol: string;
  SecurityType: string;
  TradeType: string;
  Strike?: string;
  Expiration?: string;
  'Call/Put'?: string;
  OptionContracts?: string;
  OptionTradePremium?: string;
  NetAmount: string;
}

// Colors - matching ElevenLabs design
const colors = {
  bgPrimary: '#000000',
  bgSecondary: '#0a0a0a',
  bgCard: '#1a1a1a',
  bgHover: '#2a2a2a',
  textPrimary: '#ffffff',
  textSecondary: '#8c8c8e',
  textMuted: '#5a5a5c',
  accent: '#00c806',
  border: '#2a2a2a',
  userBubble: '#00c806',
  assistantBubble: '#2a2a2a',
};

// Symbol map for converting company names to tickers
const SYMBOL_MAP: Record<string, string> = {
  'apple': 'AAPL', 'google': 'GOOGL', 'alphabet': 'GOOGL',
  'amazon': 'AMZN', 'microsoft': 'MSFT', 'tesla': 'TSLA',
  'nvidia': 'NVDA', 'meta': 'META', 'facebook': 'META',
  'netflix': 'NFLX', 'amd': 'AMD', 'intel': 'INTC',
  'coinbase': 'COIN', 'palantir': 'PLTR', 'spy': 'SPY',
  'qqq': 'QQQ', 'nio': 'NIO', 'rivian': 'RIVN',
};

function extractSymbol(text: string): string | null {
  const upperText = text.toUpperCase();
  const tickerMatch = upperText.match(/\b([A-Z]{1,5})\b/);
  if (tickerMatch) {
    const potential = tickerMatch[1];
    const validTickers = ['AAPL', 'GOOGL', 'GOOG', 'AMZN', 'MSFT', 'TSLA', 'NVDA', 'META', 'NFLX', 'AMD', 'INTC', 'COIN', 'PLTR', 'SPY', 'QQQ', 'NIO', 'RIVN'];
    if (validTickers.includes(potential)) return potential;
  }
  const lowerText = text.toLowerCase();
  for (const [name, ticker] of Object.entries(SYMBOL_MAP)) {
    if (lowerText.includes(name)) return ticker;
  }
  return null;
}

interface QueryIntent {
  cardType: CardType;
  symbol?: string;
  tradeType?: 'buy' | 'sell';
  timePeriod?: string;
  callPut?: 'call' | 'put';
  expiration?: string;
  accountQueryType?: AccountQueryType;
  feeType?: FeeType;
  confidence?: number;
}

// Fetch trade data from UI APIs
async function fetchTradeData(
  symbol: string,
  type: CardType,
  tradeType?: 'buy' | 'sell' | 'all',
  timePeriod?: string,
  extraParams?: { callPut?: 'call' | 'put'; expiration?: string; accountQueryType?: AccountQueryType; feeType?: FeeType; includeTrades?: boolean }
): Promise<TradeUIData | null> {
  try {
    let endpoint: string;
    let body: Record<string, unknown> = { symbol };

    const optionTradeType = tradeType === 'buy' ? 'B' : tradeType === 'sell' ? 'S' : undefined;
    const optionCallPut = extraParams?.callPut === 'call' ? 'C' : extraParams?.callPut === 'put' ? 'P' : undefined;

    if (type === 'account-balance') {
      endpoint = '/api/account-balance-ui';
      body = { queryType: extraParams?.accountQueryType, timePeriod };
    } else if (type === 'fees') {
      endpoint = '/api/fees-ui';
      body = { feeType: extraParams?.feeType, timePeriod, symbol: symbol || undefined };
    } else if (type === 'average-price') {
      endpoint = '/api/average-price';
      const includeTrades = extraParams?.includeTrades ?? true;
      body = { symbol, tradeType: tradeType || 'all', timePeriod, includeTrades };
    } else if (type === 'last-option') {
      endpoint = '/api/advanced-query-ui';
      body = {
        symbol: symbol || undefined,
        securityType: 'O',
        tradeType: optionTradeType,
        callPut: optionCallPut,
        orderBy: 'date',
        orderDir: 'desc',
        limit: 1,
      };
    } else if (type === 'advanced-options' || type === 'highest-strike' || type === 'total-premium' || type === 'expiring-options') {
      endpoint = '/api/advanced-query-ui';
      body = {
        symbol: symbol || undefined,
        securityType: 'O',
        tradeType: optionTradeType,
        callPut: optionCallPut,
        fromDate: timePeriod || undefined,
        expiration: extraParams?.expiration || undefined,
        ...(type === 'highest-strike' ? { orderBy: 'strike', orderDir: 'desc', limit: 1 } : {}),
      };
    } else if (type === 'stats') {
      const [stockRes, optionRes] = await Promise.all([
        fetch('/api/trade-stats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, tradeType: tradeType || 'all', timePeriod }),
        }),
        fetch('/api/option-stats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, tradeType: tradeType || 'all', timePeriod }),
        }),
      ]);

      if (!stockRes.ok) {
        console.error(`[fetchTradeData] /api/trade-stats returned ${stockRes.status}`);
        return null;
      }

      const stockData = await stockRes.json();
      const optionData = optionRes.ok ? await optionRes.json() : null;

      return {
        type,
        symbol,
        tradeType,
        timePeriod,
        callPut: extraParams?.callPut,
        expiration: extraParams?.expiration,
        data: stockData,
        optionData,
        accountQueryType: extraParams?.accountQueryType,
        feeType: extraParams?.feeType,
      };
    } else if (type === 'profitable') {
      endpoint = '/api/profitable-trades-ui';
      body = { symbol, timePeriod };
    } else if (type === 'time-based') {
      endpoint = '/api/time-trades-ui';
      body = { symbol: symbol || null, timePeriod };
    } else if (type === 'detailed' || type === 'summary') {
      endpoint = '/api/trades-ui';
      body = { symbol };
    } else {
      return null;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.error(`[fetchTradeData] ${endpoint} returned ${response.status}`);
      return null;
    }

    const data = await response.json();

    return {
      type,
      symbol,
      tradeType,
      timePeriod,
      callPut: extraParams?.callPut,
      expiration: extraParams?.expiration,
      data,
      optionData: undefined,
      accountQueryType: extraParams?.accountQueryType,
      feeType: extraParams?.feeType,
    };
  } catch (err) {
    console.error('Failed to fetch trade data:', err);
    return null;
  }
}

const numberPattern = '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\\d+)';
const timePeriodRegex = new RegExp(
  `\\b(today|yesterday|last\\s+week|this\\s+week|last\\s+month|this\\s+month|last\\s+year|this\\s+year|ytd|(?:last|past)\\s+${numberPattern}\\s+days?|(?:last|past)\\s+${numberPattern}\\s+months?|(?:last|past)\\s+${numberPattern}\\s+trading\\s+days?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b`,
  'i'
);

// Regex-based intent detection (fallback when LLM classification fails)
function detectIntentFallback(query: string): QueryIntent | null {
  const lowerQuery = query.toLowerCase();
  const symbol = extractSymbol(query) ?? undefined;

  // Time period extraction
  const timePeriodMatch = lowerQuery.match(timePeriodRegex);
  const timePeriod = timePeriodMatch?.[1];

  // Trade type extraction
  const isSellQuery = /\b(sold|sell|selling|short|written)\b/i.test(lowerQuery);
  const isBuyQuery = /\b(bought|buy|buying|long|purchased)\b/i.test(lowerQuery);
  const tradeType: QueryIntent['tradeType'] = isSellQuery ? 'sell' : isBuyQuery ? 'buy' : undefined;

  // Call/put extraction
  const isCallQuery = /\bcalls?\b/i.test(lowerQuery);
  const isPutQuery = /\bputs?\b/i.test(lowerQuery);
  const callPut: QueryIntent['callPut'] = isCallQuery && !isPutQuery ? 'call' : isPutQuery && !isCallQuery ? 'put' : undefined;

  // Historical trades (generic)
  if (/\b(historical\s+trades?|trade\s+history|historical\s+trade\s+data)\b/i.test(lowerQuery)) {
    return { cardType: 'time-based', timePeriod: timePeriod || 'last 30 days' };
  }

  // Account balance queries
  if (/\b(balance|buying\s*power|equity|margin|net\s*liquidation|nlv|market\s*value|withdraw|available\s*funds|how\s*much\s*money)\b/i.test(lowerQuery)) {
    let accountQueryType: AccountQueryType = 'account_summary';
    if (/how\s*much\s*money\s*(do\s*i|have)/i.test(lowerQuery)) accountQueryType = 'money_summary';
    else if (/withdraw|available\s*(funds|cash)/i.test(lowerQuery)) accountQueryType = 'cash_balance';
    else if (/cash\s*balance/i.test(lowerQuery)) accountQueryType = 'cash_balance';
    else if (/buying\s*power/i.test(lowerQuery)) accountQueryType = 'buying_power';
    else if (/nlv|net\s*liquidation/i.test(lowerQuery)) accountQueryType = 'nlv';
    else if (/margin/i.test(lowerQuery)) accountQueryType = 'overnight_margin';
    else if (/market\s*value/i.test(lowerQuery)) accountQueryType = 'market_value';
    else if (/debit\s*balance/i.test(lowerQuery)) accountQueryType = 'debit_balances';
    else if (/credit\s*balance/i.test(lowerQuery)) accountQueryType = 'credit_balances';
    return { cardType: 'account-balance', accountQueryType, timePeriod };
  }

  // Fees queries
  if (/\b(fees?|commissions?|interest|locate)\b/i.test(lowerQuery)) {
    let feeType: FeeType = 'commission';
    if (/credit\s*interest/i.test(lowerQuery)) feeType = 'credit_interest';
    else if (/debit\s*interest|margin\s*interest/i.test(lowerQuery)) feeType = 'debit_interest';
    else if (/locate/i.test(lowerQuery)) feeType = 'locate_fee';
    return { cardType: 'fees', feeType, timePeriod, symbol };
  }

  // Expiring options
  if (/\b(expir(?:ing|es?|ation))\s+(tomorrow|this\s+week|this\s+month)/i.test(lowerQuery) || /options?\s+expir/i.test(lowerQuery)) {
    const expirationMatch =
      lowerQuery.match(/expir\w*\s+(tomorrow|this\s+week|this\s+month)/i) ||
      lowerQuery.match(/(tomorrow|this\s+week|this\s+month)/i);
    return { cardType: 'expiring-options', expiration: expirationMatch?.[1] || 'tomorrow', symbol };
  }

  // Last option trade
  if (/\b(last|most\s+recent|latest)\s+(call|put|options?)\b/i.test(lowerQuery)) {
    return { cardType: 'last-option', symbol, tradeType, callPut };
  }

  // Highest strike
  if (/\b(highest|lowest)\s+strike\b/i.test(lowerQuery)) {
    return { cardType: 'highest-strike', symbol, tradeType, callPut, timePeriod };
  }

  // Total premium
  if (/\btotal\s+premium\b/i.test(lowerQuery) || /\bpremium\s+(collected|paid|received)\b/i.test(lowerQuery)) {
    return { cardType: 'total-premium', symbol, tradeType, timePeriod };
  }

  // Bulk options queries
  const isBulkOptionsQuery =
    /\bshow\s+(?:me\s+)?(?:all\s+)?(?:the\s+)?(?:my\s+)?(short|long)?\s*(call|put)s?\s*(?:options?)?\b/i.test(lowerQuery) ||
    /\ball\s+(?:the\s+)?(?:my\s+)?(short|long)?\s*(call|put)s?\s*(?:options?)?\b/i.test(lowerQuery) ||
    /\bmy\s+(short|long)?\s*(call|put)s?\s*(?:options?)?\b/i.test(lowerQuery) ||
    /\b(short|long)\s+(call|put)s?\s*(?:options?)?\s+(on|for)\b/i.test(lowerQuery) ||
    /\boption\s+trades?\b/i.test(lowerQuery);

  if (isBulkOptionsQuery) {
    return { cardType: 'advanced-options', symbol, tradeType, callPut, timePeriod };
  }

  // Average price (before general stats)
  if (/\b(average|avg)\s+(price|cost)\b/i.test(lowerQuery) && !/\b(highest|lowest|max|min)\b/i.test(lowerQuery)) {
    return { cardType: 'average-price', symbol, tradeType, timePeriod };
  }

  // Trade stats (highest/lowest price)
  if (/\b(highest|lowest|max|min)\b/i.test(lowerQuery) && /\bprice\b/i.test(lowerQuery)) {
    return { cardType: 'stats', symbol, tradeType, timePeriod };
  }

  // Profitable trades
  if (/\b(profitable|profit|gains?|winners?|winning)\b/i.test(lowerQuery)) {
    return { cardType: 'profitable', symbol };
  }

  // Time-based trades (must come before detailed trades)
  if (timePeriod && /\btrades?\b/i.test(lowerQuery)) {
    return { cardType: 'time-based', symbol, timePeriod };
  }

  // Detailed trades
  if (
    /\b(show|list|get|display|what)\s+(my\s+|did\s+I\s+)?(\w+\s+)*(all\s+)?trades?\b/i.test(lowerQuery) ||
    /\btrades?\s+(for|on)\s+/i.test(lowerQuery) ||
    /\bmy\s+\w+\s+trades?\b/i.test(lowerQuery)
  ) {
    return { cardType: 'detailed', symbol };
  }

  if (symbol && /\btrades?\b/i.test(lowerQuery)) {
    return { cardType: 'detailed', symbol };
  }

  return null;
}

function isHighSignalOptionIntent(intent: QueryIntent | null): boolean {
  if (!intent) return false;
  return (
    intent.cardType === 'last-option' ||
    intent.cardType === 'highest-strike' ||
    intent.cardType === 'total-premium' ||
    intent.cardType === 'expiring-options' ||
    intent.cardType === 'advanced-options'
  );
}

function chooseIntent(
  llmIntent: QueryIntent | null,
  regexIntent: QueryIntent | null
): QueryIntent | null {
  // If both agree, prefer the LLM intent (usually has better entity extraction)
  if (llmIntent && regexIntent && llmIntent.cardType === regexIntent.cardType) {
    return llmIntent;
  }

  // If LLM is highly confident, trust it even if regex differs
  if (llmIntent && (llmIntent.confidence ?? 0) >= 0.85) {
    return llmIntent;
  }

  // For high-signal option patterns, prefer regex when LLM is uncertain
  if (isHighSignalOptionIntent(regexIntent) && (!llmIntent || (llmIntent.confidence ?? 0) < 0.85)) {
    return regexIntent;
  }

  // Default: prefer LLM if available, otherwise regex
  return llmIntent || regexIntent;
}

// Classify user intent from their message (LLM via API, with regex fallback)
async function classifyIntent(query: string): Promise<QueryIntent | null> {
  const regexIntent = detectIntentFallback(query);
  let llmIntent: QueryIntent | null = null;

  try {
    const response = await fetch('/api/classify-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        currentDate: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });

    if (response.ok) {
      const { result } = await response.json() as {
        result: {
          cardType: CardType;
          confidence: number;
          entities: {
            symbol?: string;
            tradeType?: 'buy' | 'sell';
            timePeriod?: string;
            callPut?: 'call' | 'put';
            expiration?: string;
            accountQueryType?: AccountQueryType;
            feeType?: FeeType;
          };
        } | null;
      };

      if (result) {
        llmIntent = {
          cardType: result.cardType,
          symbol: result.entities.symbol,
          tradeType: result.entities.tradeType,
          timePeriod: result.entities.timePeriod,
          callPut: result.entities.callPut,
          expiration: result.entities.expiration,
          accountQueryType: result.entities.accountQueryType,
          feeType: result.entities.feeType,
          confidence: result.confidence,
        };
      }
    }
  } catch (error) {
    console.warn('[Intent] LLM classification failed, using regex fallback:', error);
  }

  const chosen = chooseIntent(llmIntent, regexIntent);
  if (!chosen) return null;

  // Safety: avoid routing time-based queries into the unfiltered detailed endpoint.
  if (chosen.cardType === 'detailed' && chosen.timePeriod && /\btrades?\b/i.test(query)) {
    return { ...chosen, cardType: 'time-based' };
  }

  return chosen;
}

// Render UI card based on data type
function TradeUICard({ data, onClose }: { data: TradeUIData; onClose: () => void }) {
  const renderCard = () => {
    switch (data.type) {
      case 'summary': {
        const apiData = data.data as { summary?: { stockCount?: number; optionCount?: number } } | undefined;
        return (
          <TradeSummary
            symbol={data.symbol}
            stockCount={apiData?.summary?.stockCount || 0}
            optionCount={apiData?.summary?.optionCount || 0}
          />
        );
      }
      case 'detailed': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const apiData = data.data as { trades?: any[]; summary?: any } | undefined;
        return <TradesTable trades={apiData?.trades || []} summary={apiData?.summary} />;
      }
      case 'stats': {
        const apiData = data.data as { stats?: Record<string, unknown> } | undefined;
        const stats = apiData?.stats;
        const optionApiData = data.optionData as { stats?: Record<string, unknown> } | undefined;
        const optionStats = optionApiData?.stats;

        if (!stats) return null;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <TradeStats
              symbol={stats.symbol as string || data.symbol}
              year={stats.year as number || new Date().getFullYear()}
              tradeType={(stats.tradeType as 'buy' | 'sell' | 'all') || 'all'}
              timePeriod={stats.timePeriod as string | null}
              highestPrice={stats.highestPrice as number || 0}
              highestPriceDate={stats.highestPriceDate as string || ''}
              highestPriceShares={stats.highestPriceShares as number || 0}
              lowestPrice={stats.lowestPrice as number || 0}
              lowestPriceDate={stats.lowestPriceDate as string || ''}
              lowestPriceShares={stats.lowestPriceShares as number || 0}
              averagePrice={stats.averagePrice as number || 0}
              totalTrades={stats.totalTrades as number || 0}
              totalShares={stats.totalShares as number || 0}
              totalValue={stats.totalValue as number || 0}
            />
            {optionStats && (
              <OptionStats
                symbol={optionStats.symbol as string || data.symbol}
                year={optionStats.year as number || new Date().getFullYear()}
                tradeType={(optionStats.tradeType as 'buy' | 'sell' | 'all') || 'all'}
                timePeriod={optionStats.timePeriod as string | null}
                highestPremium={optionStats.highestPremium as number || 0}
                highestPremiumDate={optionStats.highestPremiumDate as string || ''}
                highestPremiumContracts={optionStats.highestPremiumContracts as number || 0}
                highestPremiumStrike={optionStats.highestPremiumStrike as number || 0}
                highestPremiumCallPut={(optionStats.highestPremiumCallPut as 'Call' | 'Put') || 'Call'}
                lowestPremium={optionStats.lowestPremium as number || 0}
                lowestPremiumDate={optionStats.lowestPremiumDate as string || ''}
                lowestPremiumContracts={optionStats.lowestPremiumContracts as number || 0}
                lowestPremiumStrike={optionStats.lowestPremiumStrike as number || 0}
                lowestPremiumCallPut={(optionStats.lowestPremiumCallPut as 'Call' | 'Put') || 'Call'}
                averagePremium={optionStats.averagePremium as number || 0}
                totalTrades={optionStats.totalTrades as number || 0}
                totalContracts={optionStats.totalContracts as number || 0}
                totalValue={optionStats.totalValue as number || 0}
                callCount={optionStats.callCount as number || 0}
                putCount={optionStats.putCount as number || 0}
              />
            )}
          </div>
        );
      }
      case 'profitable': {
        const apiData = data.data as {
          symbol?: string;
          totalProfitableTrades?: number;
          totalProfit?: number;
          trades?: Array<{
            securityType: string;
            buyDate: string;
            sellDate: string;
            quantity: number;
            buyPrice: number;
            sellPrice: number;
            profitLoss: number;
          }>;
        } | undefined;

        return (
          <ProfitableTrades
            symbol={apiData?.symbol || data.symbol}
            totalProfitableTrades={apiData?.totalProfitableTrades || 0}
            totalProfit={apiData?.totalProfit || 0}
            trades={apiData?.trades || []}
          />
        );
      }
      case 'time-based': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const apiData = data.data as { trades?: any[]; summary?: any; timePeriod?: any; symbol?: string } | undefined;
        return <TimeBasedTrades
          trades={apiData?.trades || []}
          summary={apiData?.summary || { totalTrades: 0, stockCount: 0, optionCount: 0, totalValue: 0 }}
          timePeriod={apiData?.timePeriod || { description: data.timePeriod || '', displayRange: '', tradingDays: 0 }}
          symbol={apiData?.symbol}
        />;
      }
      case 'average-price': {
        const apiData = data.data as {
          symbol?: string;
          averagePrice?: number | null;
          timePeriod?: string;
          tradeType?: string;
          totalTrades?: number;
          totalShares?: number;
          highestPrice?: number;
          lowestPrice?: number;
        } | undefined;

        return (
          <AveragePrice
            symbol={apiData?.symbol || data.symbol}
            averagePrice={apiData?.averagePrice || 0}
            timePeriod={apiData?.timePeriod || data.timePeriod || ''}
            tradeType={(apiData?.tradeType as 'buy' | 'sell' | 'all') || data.tradeType || 'all'}
            totalTrades={apiData?.totalTrades || 0}
            totalShares={apiData?.totalShares}
            highestPrice={apiData?.highestPrice}
            lowestPrice={apiData?.lowestPrice}
          />
        );
      }
      case 'advanced-options': {
        const apiData = data.data as {
          trades?: OptionTrade[];
          aggregations?: {
            tradeCount?: number;
            totalTrades?: number;
            totalPremium: number;
            totalNetAmount?: number;
            avgPremium?: number;
            totalContracts?: number;
            sharesCovered?: number;
            callCount: number;
            putCount: number;
          };
          filters?: Record<string, unknown>;
        } | undefined;

        return (
          <BulkOptionsCard
            trades={apiData?.trades || []}
            symbol={data.symbol}
            callPut={data.callPut}
            tradeType={data.tradeType}
            timePeriod={data.timePeriod}
            aggregations={apiData?.aggregations}
          />
        );
      }
      case 'highest-strike': {
        const apiData = data.data as {
          trades?: Array<{
            Symbol?: string;
            UnderlyingSymbol?: string;
            Strike?: string;
            'Call/Put'?: string;
            TradeType?: string;
            Date?: string;
            Expiration?: string;
            OptionContracts?: string;
            NetAmount?: string;
          }>;
        } | undefined;

        const trade = apiData?.trades?.[0];
        if (!trade) return null;

        const symbol = trade.UnderlyingSymbol || trade.Symbol?.match(/^([A-Z]+)/)?.[1] || data.symbol;

        return (
          <HighestStrikeCard
            symbol={symbol}
            strike={parseFloat(trade.Strike || '0')}
            callPut={trade['Call/Put'] === 'C' ? 'Call' : 'Put'}
            tradeType={trade.TradeType === 'B' ? 'buy' : 'sell'}
            date={trade.Date || ''}
            expiration={trade.Expiration || ''}
            contracts={parseFloat(trade.OptionContracts || '0')}
            premium={Math.abs(parseFloat(trade.NetAmount || '0'))}
            isHighest={true}
          />
        );
      }
      case 'total-premium': {
        const apiData = data.data as {
          aggregations?: {
            totalPremium?: number;
            totalTrades?: number;
            tradeCount?: number;
            totalContracts?: number;
            callCount?: number;
            putCount?: number;
          };
        } | undefined;

        const agg = apiData?.aggregations;

        return (
          <TotalPremiumCard
            symbol={data.symbol}
            tradeType={data.tradeType || 'all'}
            totalPremium={agg?.totalPremium || 0}
            totalTrades={agg?.totalTrades || agg?.tradeCount || 0}
            totalContracts={agg?.totalContracts || 0}
            timePeriod={data.timePeriod || ''}
            callCount={agg?.callCount}
            putCount={agg?.putCount}
          />
        );
      }
      case 'expiring-options': {
        const apiData = data.data as {
          trades?: unknown[];
          aggregations?: {
            tradeCount?: number;
            totalPremium?: number;
            callCount?: number;
            putCount?: number;
            totalContracts?: number;
          };
        } | undefined;

        return (
          <ExpiringOptionsTable
            trades={apiData?.trades as ExpiringOption[] || []}
            expirationPeriod={data.expiration || 'tomorrow'}
            aggregations={apiData?.aggregations}
          />
        );
      }
      case 'last-option': {
        const apiData = data.data as {
          trades?: Array<{
            Symbol?: string;
            UnderlyingSymbol?: string;
            Strike?: string;
            'Call/Put'?: string;
            TradeType?: string;
            Date?: string;
            Expiration?: string;
            OptionContracts?: string;
            NetAmount?: string;
          }>;
        } | undefined;

        const trade = apiData?.trades?.[0];
        if (!trade) return null;

        const symbol = trade.UnderlyingSymbol || trade.Symbol?.match(/^([A-Z]+)/)?.[1] || data.symbol;

        return (
          <LastOptionTradeCard
            symbol={symbol}
            callPut={trade['Call/Put'] === 'C' ? 'Call' : 'Put'}
            tradeType={trade.TradeType === 'B' ? 'buy' : 'sell'}
            strike={parseFloat(trade.Strike || '0')}
            expiration={trade.Expiration || ''}
            tradeDate={trade.Date || ''}
            contracts={parseFloat(trade.OptionContracts || '0')}
            totalValue={Math.abs(parseFloat(trade.NetAmount || '0'))}
          />
        );
      }
      case 'account-balance': {
        const apiData = data.data as {
          queryType?: AccountQueryType;
          date?: string;
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
        } | undefined;
        if (!apiData) return null;
        return (
          <AccountSummary
            queryType={apiData.queryType || data.accountQueryType || 'account_summary'}
            date={apiData.date || new Date().toISOString().split('T')[0]}
            cashBalance={apiData.cashBalance}
            accountEquity={apiData.accountEquity}
            dayTradingBP={apiData.dayTradingBP}
            stockLMV={apiData.stockLMV}
            stockSMV={apiData.stockSMV}
            optionsLMV={apiData.optionsLMV}
            optionsSMV={apiData.optionsSMV}
            creditBalance={apiData.creditBalance}
            debitBalance={apiData.debitBalance}
            houseRequirement={apiData.houseRequirement}
            houseExcessDeficit={apiData.houseExcessDeficit}
            fedRequirement={apiData.fedRequirement}
            fedExcessDeficit={apiData.fedExcessDeficit}
          />
        );
      }
      case 'fees': {
        const apiData = data.data as {
          feeType?: string;
          totalAmount?: number;
          transactionCount?: number;
          timePeriod?: string;
          symbol?: string;
          breakdown?: Array<{ date: string; amount: number; symbol?: string }>;
        } | undefined;

        return (
          <FeesSummary
            feeType={(apiData?.feeType as FeeType) || data.feeType || 'commission'}
            totalAmount={apiData?.totalAmount || 0}
            transactionCount={apiData?.transactionCount || 0}
            timePeriod={apiData?.timePeriod || data.timePeriod || ''}
            symbol={apiData?.symbol}
            breakdown={apiData?.breakdown}
          />
        );
      }
      default:
        return null;
    }
  };

  return (
    <div style={{
      position: 'relative',
      background: colors.bgCard,
      borderRadius: '12px',
      border: `1px solid ${colors.border}`,
      overflow: 'hidden',
      marginTop: '12px',
    }}>
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: 'rgba(0,0,0,0.5)',
          border: 'none',
          borderRadius: '50%',
          padding: '4px',
          cursor: 'pointer',
          zIndex: 10,
          color: colors.textSecondary,
        }}
      >
        <X size={16} />
      </button>
      {renderCard()}
    </div>
  );
}

// Voice Assistant UI Component (inside LiveKitRoom)
function VoiceAssistantUI({
  transcript,
  setTranscript,
  onMessageProcessed,
}: {
  transcript: TranscriptMessage[];
  setTranscript: React.Dispatch<React.SetStateAction<TranscriptMessage[]>>;
  onMessageProcessed: (message: TranscriptMessage) => void;
}) {
  const { state, audioTrack } = useVoiceAssistant();
  const { localParticipant, microphoneTrack } = useLocalParticipant();
  const room = useRoomContext();
  const transcriptions = useTranscriptions({ room });
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [textInput, setTextInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoadingUI, setIsLoadingUI] = useState(false);
  const processedFinalMessageIdsRef = useRef<Set<string>>(new Set());
  const finalizeTimersRef = useRef<Map<string, number>>(new Map());
  const latestTextRef = useRef<Map<string, string>>(new Map());

  const upsertTranscriptMessage = useCallback((msg: TranscriptMessage) => {
    setTranscript((prev) => {
      const existingIdx = prev.findIndex((m) => m.id === msg.id);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = { ...updated[existingIdx], ...msg, tradeUI: updated[existingIdx].tradeUI };
        return updated;
      }
      return [...prev, msg];
    });
  }, [setTranscript]);

  // Text-stream transcriptions -> messages + UI cards.
  // Some agents don't set a reliable `lk.transcription_final` attribute for user speech; debounce-finalize instead.
  useEffect(() => {
    const isTruthyAttr = (value: unknown): boolean => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value === 1;
      if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        return v === 'true' || v === '1' || v === 'yes';
      }
      return false;
    };

    const timers = finalizeTimersRef.current;

    transcriptions.forEach((t) => {
      const segmentId = t.streamInfo.attributes?.['lk.segment_id'] || t.streamInfo.id;

      const identityMatch = t.participantInfo.identity === localParticipant?.identity;
      const transcribedTrackId = t.streamInfo.attributes?.['lk.transcribed_track_id'];
      const trackMatch = Boolean(transcribedTrackId && microphoneTrack?.trackSid && transcribedTrackId === microphoneTrack.trackSid);
      const isUser = identityMatch || trackMatch;

      const finalAttr = t.streamInfo.attributes?.['lk.transcription_final'];
      const isFinal = isTruthyAttr(finalAttr);

      const msgId = `${isUser ? 'u' : 'a'}:${segmentId}`;
      const msg: TranscriptMessage = {
        id: msgId,
        role: isUser ? 'user' : 'assistant',
        content: t.text,
        timestamp: new Date(),
        isFinal,
      };

      upsertTranscriptMessage(msg);

      if (!isUser) return;

      latestTextRef.current.set(msgId, t.text);

      // If the server explicitly marks this segment final, process immediately.
      if (isFinal) {
        const existingTimer = finalizeTimersRef.current.get(msgId);
        if (existingTimer) {
          window.clearTimeout(existingTimer);
          finalizeTimersRef.current.delete(msgId);
        }
        if (!processedFinalMessageIdsRef.current.has(msgId) && t.text.trim().length >= 3) {
          processedFinalMessageIdsRef.current.add(msgId);
          onMessageProcessed({ ...msg, isFinal: true });
        }
        return;
      }

      // Debounce-finalize: if the text hasn't changed for a short window, treat as final.
      const existingTimer = timers.get(msgId);
      if (existingTimer) window.clearTimeout(existingTimer);

      const timeoutId = window.setTimeout(() => {
        const text = latestTextRef.current.get(msgId) || '';
        if (processedFinalMessageIdsRef.current.has(msgId)) return;
        if (text.trim().length < 3) return;
        processedFinalMessageIdsRef.current.add(msgId);

        setTranscript((prev) => prev.map((m) => (
          m.id === msgId ? { ...m, content: text, isFinal: true } : m
        )));
        onMessageProcessed({
          id: msgId,
          role: 'user',
          content: text,
          timestamp: new Date(),
          isFinal: true,
        });
      }, 900);

      timers.set(msgId, timeoutId);
    });

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    };
  }, [transcriptions, localParticipant?.identity, microphoneTrack?.trackSid, upsertTranscriptMessage, onMessageProcessed, setTranscript]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  // Send text message to agent
  const sendTextMessage = useCallback(async () => {
    if (!textInput.trim() || isSending || !room?.localParticipant) return;

    const query = textInput.trim();
    setIsSending(true);
    setTextInput('');

    try {
      // Add user message immediately
      const userMsgId = `msg-${Date.now()}-user`;
      const userMsg: TranscriptMessage = {
        id: userMsgId,
        role: 'user',
        content: query,
        timestamp: new Date(),
      };
      setTranscript(prev => [...prev, userMsg]);

      // Send to agent
      await room.localParticipant.sendText(query, { topic: 'lk.chat' });

      // Classify and fetch UI data
      setIsLoadingUI(true);
      const intent = await classifyIntent(query);
      if (intent) {
        const symbol = intent.symbol || extractSymbol(query) || '';
        const data = await fetchTradeData(
          symbol,
          intent.cardType,
          intent.tradeType,
          intent.timePeriod,
          {
            callPut: intent.callPut,
            expiration: intent.expiration,
            accountQueryType: intent.accountQueryType,
            feeType: intent.feeType,
          }
        );
        if (data) {
          // Update the user message with tradeUI
          setTranscript(prev => prev.map(m =>
            m.id === userMsgId ? { ...m, tradeUI: data } : m
          ));
        }
      }
    } catch (err) {
      console.error('Failed to send text message:', err);
    } finally {
      setIsSending(false);
      setIsLoadingUI(false);
    }
  }, [textInput, isSending, room, setTranscript]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage();
    }
  };

  const getStateLabel = (agentState: AgentState): string => {
    switch (agentState) {
      case 'disconnected': return 'Disconnected';
      case 'connecting': return 'Connecting...';
      case 'initializing': return 'Initializing...';
      case 'listening': return 'Listening...';
      case 'thinking': return 'Thinking...';
      case 'speaking': return 'Speaking...';
      default: return 'Ready';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, backgroundColor: colors.bgPrimary, overflow: 'hidden', minHeight: 0 }}>
      {/* Voice Header with small orb */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: `1px solid ${colors.border}`,
        backgroundColor: colors.bgSecondary,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Small orb indicator */}
          <div style={{
            position: 'relative',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: `radial-gradient(circle at 50% 50%, #00ff08, ${colors.accent}, #008a04)`,
            boxShadow: '0 0 12px rgba(0, 200, 6, 0.5)',
            animation: state === 'speaking' ? 'pulse 1s infinite' : 'none',
          }}>
            <div style={{
              position: 'absolute',
              top: '5px',
              left: '6px',
              width: '8px',
              height: '6px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.5)',
            }} />
          </div>
          <div>
            <div style={{ color: colors.textPrimary, fontSize: '14px', fontWeight: 600 }}>
              {isLoadingUI ? 'Loading...' : getStateLabel(state)}
            </div>
            <div style={{ color: colors.textMuted, fontSize: '12px' }}>
              Say something to talk
            </div>
          </div>
        </div>

        {/* Visualizer */}
        <div style={{ width: '100px', height: '32px' }}>
          <BarVisualizer
            state={state}
            barCount={5}
            trackRef={audioTrack}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      </div>

      {/* Transcript Area */}
      <div ref={transcriptRef} style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        paddingBottom: '8px',
        minHeight: 0,
      }}>
        {transcript.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: colors.textMuted,
            textAlign: 'center',
            padding: '32px',
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: `radial-gradient(circle at 50% 50%, #00ff08, ${colors.accent}, #008a04)`,
              marginBottom: '16px',
              opacity: 0.5,
            }} />
            <p style={{ fontSize: '14px', marginBottom: '8px' }}>
              Start speaking...
            </p>
            <p style={{ fontSize: '12px' }}>
              Your conversation will appear here
            </p>
          </div>
        ) : (
          <>
            {transcript.map((msg) => (
              <div key={msg.id}>
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    marginBottom: '16px',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  {msg.role === 'assistant' && (
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: colors.accent,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: colors.bgPrimary,
                      fontSize: '11px',
                      fontWeight: 700,
                      flexShrink: 0,
                    }}>FA</div>
                  )}
                  <div style={{
                    backgroundColor: msg.role === 'user' ? colors.accent : colors.assistantBubble,
                    color: msg.role === 'user' ? colors.bgPrimary : colors.textPrimary,
                    borderRadius: '16px',
                    borderTopLeftRadius: msg.role === 'assistant' ? '4px' : '16px',
                    borderTopRightRadius: msg.role === 'user' ? '4px' : '16px',
                    padding: '12px 16px',
                    maxWidth: '280px',
                    opacity: msg.isFinal === false ? 0.7 : 1,
                    transition: 'opacity 0.2s ease',
                  }}>
                    <p style={{ fontSize: '14px', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>
                      {msg.content}
                      {msg.isFinal === false && <span style={{ color: colors.textMuted }}> ...</span>}
                    </p>
                  </div>
                </div>
                {/* Render trade UI if available */}
                {msg.tradeUI && (
                  <TradeUICard
                    data={msg.tradeUI}
                    onClose={() => setTranscript(prev => prev.map(m =>
                      m.id === msg.id ? { ...m, tradeUI: undefined } : m
                    ))}
                  />
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Text Input */}
      <div style={{
        padding: '12px 16px',
        borderTop: `1px solid ${colors.border}`,
        backgroundColor: colors.bgSecondary,
        flexShrink: 0,
      }}>
        <form onSubmit={(e) => { e.preventDefault(); sendTextMessage(); }} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={isSending}
            style={{
              flex: 1,
              padding: '10px 14px',
              fontSize: '14px',
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              outline: 'none',
              backgroundColor: colors.bgCard,
              color: colors.textPrimary,
            }}
          />
          <button
            type="submit"
            disabled={!textInput.trim() || isSending}
            style={{
              padding: '10px 16px',
              fontSize: '14px',
              fontWeight: 500,
              color: colors.bgPrimary,
              backgroundColor: colors.accent,
              border: 'none',
              borderRadius: '8px',
              cursor: textInput.trim() && !isSending ? 'pointer' : 'not-allowed',
              opacity: textInput.trim() && !isSending ? 1 : 0.5,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Send size={14} />
          </button>
        </form>
      </div>

      <VoiceAssistantControlBar />
      <RoomAudioRenderer />
    </div>
  );
}

// Main LiveKit Voice Assistant Component
export function LiveKitVoiceAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentView, setCurrentView] = useState<View>('chat');
  const [inputMode, setInputMode] = useState<InputMode>('voice');
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [textInput, setTextInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const processedMessagesRef = useRef<Set<string>>(new Set());
  const voiceTitleSetRef = useRef(false); // Track if title has been set for this conversation
  const currentConversationIdRef = useRef<string | null>(null); // Ref to avoid stale closures

  // Keep ref in sync with state
  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  // Fetch conversations on mount
  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/conversations');
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    }
  };

  const createConversation = async (title?: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title || 'New Chat' }),
      });
      const data = await res.json();
      if (data.conversation) {
        setConversations((prev) => [data.conversation, ...prev]);
        return data.conversation.id;
      }
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
    return null;
  };

  const saveMessage = async (conversationId: string, role: 'user' | 'assistant', content: string) => {
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, role, content }),
      });
    } catch (error) {
      console.error('Failed to save message:', error);
    }
  };

  const loadConversationMessages = async (conversationId: string) => {
    try {
      const res = await fetch(`/api/messages?conversationId=${conversationId}`);
      const data = await res.json();
      if (data.messages) {
        const messages: TranscriptMessage[] = data.messages.map((m: { id: string; role: string; content: string; created_at: string }) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: new Date(m.created_at),
        }));
        setTranscript(messages);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const updateConversationTitle = async (conversationId: string, title: string) => {
    try {
      await fetch(`/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      setConversations(prev => prev.map(c =>
        c.id === conversationId ? { ...c, title } : c
      ));
    } catch (error) {
      console.error('Failed to update title:', error);
    }
  };

  const startSession = useCallback(async (options?: { skipConversation?: boolean }) => {
    setIsConnecting(true);

    try {
      if (!options?.skipConversation) {
        // Create a new conversation if we don't have one
        let convId = currentConversationIdRef.current;
        if (!convId) {
          console.log('[LiveKit] Creating new conversation for voice session');
          convId = await createConversation('New Chat');
          setCurrentConversationId(convId);
          currentConversationIdRef.current = convId; // Update ref immediately
          voiceTitleSetRef.current = false; // Reset title tracking
          console.log('[LiveKit] Created conversation:', convId);
        }
      }

      const micWarmup = navigator.mediaDevices?.getUserMedia
        ? navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null)
        : Promise.resolve(null);

      const [detailsRes] = await Promise.all([
        fetch('/api/livekit/connection-details'),
        // Kick off mic permission in parallel to reduce perceived startup time.
        micWarmup,
      ]);

      if (!detailsRes.ok) throw new Error('Failed to get connection details');
      const details = await detailsRes.json();
      setConnectionDetails(details);
      setIsConnecting(false);
    } catch (err) {
      console.error('Failed to start session:', err);
      setIsConnecting(false);
    }
  }, []); // Empty deps - uses refs

  const endSession = useCallback(() => {
    setConnectionDetails(null);
    setIsConnecting(false);
  }, []);

  const handleOpen = async () => {
    setIsOpen(true);
    setCurrentView('chat');
    setInputMode('voice'); // Match ElevenLabs: open in voice mode

    // Create new conversation if needed
    if (!currentConversationIdRef.current) {
      // Don't block voice startup on DB writes; create conversation in the background.
      void (async () => {
        console.log('[LiveKit] handleOpen: Creating new conversation');
        const convId = await createConversation('New Chat');
        setCurrentConversationId(convId);
        currentConversationIdRef.current = convId; // Update ref immediately
        setTranscript([]);
        voiceTitleSetRef.current = false; // New conversation needs title
        console.log('[LiveKit] handleOpen: Created conversation:', convId);
      })();
    }

    // Auto-start voice session on open (matches ElevenLabs behavior)
    if (!connectionDetails && !isConnecting) {
      try {
        await startSession({ skipConversation: true });
      } catch (error) {
        console.error('[LiveKit] Failed to auto-start voice session:', error);
      }
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    endSession();
  };

  const handleNewChat = async () => {
    endSession();
    console.log('[LiveKit] handleNewChat: Creating new conversation');
    const convId = await createConversation('New Chat');
    setCurrentConversationId(convId);
    currentConversationIdRef.current = convId; // Update ref immediately
    setTranscript([]);
    processedMessagesRef.current.clear();
    voiceTitleSetRef.current = false; // Reset title tracking for new conversation
    setCurrentView('chat');
    console.log('[LiveKit] handleNewChat: Created conversation:', convId);
  };

  const handleSelectConversation = async (conv: Conversation) => {
    endSession();
    console.log('[LiveKit] handleSelectConversation: Loading conversation:', conv.id);
    setCurrentConversationId(conv.id);
    currentConversationIdRef.current = conv.id; // Update ref immediately
    await loadConversationMessages(conv.id);
    processedMessagesRef.current.clear();
    voiceTitleSetRef.current = true; // Existing conversation already has a title
    setCurrentView('chat');
  };

  const handleEndChat = async () => {
    console.log('[LiveKit] handleEndChat: Ending session');
    endSession();
    // Refresh conversations list to show updated title
    await fetchConversations();
    // Clear conversation ID so next session creates a new one
    setCurrentConversationId(null);
    currentConversationIdRef.current = null;
    voiceTitleSetRef.current = false;
    setTranscript([]);
    setCurrentView('history');
  };

  const toggleMode = async () => {
    if (inputMode === 'voice') {
      endSession();
      setInputMode('text');
      return;
    }

    setInputMode('voice');
    if (!connectionDetails && !isConnecting) {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        await startSession();
      } catch (error) {
        console.error('[LiveKit] Failed to start voice session:', error);
      }
    }
  };

  // Process message for trade UI and save to database
  // Using ref to avoid stale closure issues with currentConversationId
  const handleMessageProcessed = useCallback(async (message: TranscriptMessage) => {
    const convId = currentConversationIdRef.current;
    console.log('[LiveKit] handleMessageProcessed called:', {
      role: message.role,
      content: message.content.slice(0, 50),
      messageId: message.id,
      conversationId: convId,
      voiceTitleSet: voiceTitleSetRef.current,
    });

    if (message.role === 'user') {
      const userQuery = message.content.trim();
      if (userQuery.length < 3) return;

      // Save to database if we have a conversation
      if (convId) {
        console.log('[LiveKit] Saving user message to conversation:', convId);
        saveMessage(convId, message.role, userQuery);

        // Auto-generate title from first user message (only once per conversation)
        if (!voiceTitleSetRef.current) {
          const title = userQuery.slice(0, 50) + (userQuery.length > 50 ? '...' : '');
          console.log('[LiveKit] Auto-titling conversation:', title);
          updateConversationTitle(convId, title);
          voiceTitleSetRef.current = true;
        }
      } else {
        console.warn('[LiveKit] No conversation ID - message not saved');
      }

      // Always classify intent and fetch UI data for user messages
      console.log('[LiveKit] Classifying intent for:', userQuery);
      const intent = await classifyIntent(userQuery);
      console.log('[LiveKit] Intent result:', intent);

      if (intent) {
        const symbol = intent.symbol || extractSymbol(userQuery) || '';
        console.log('[LiveKit] Fetching trade data for:', intent.cardType, symbol);
        const data = await fetchTradeData(
          symbol,
          intent.cardType,
          intent.tradeType,
          intent.timePeriod,
          {
            callPut: intent.callPut,
            expiration: intent.expiration,
            accountQueryType: intent.accountQueryType,
            feeType: intent.feeType,
          }
        );
        console.log('[LiveKit] Trade data result:', data ? 'success' : 'null');
        if (data) {
          console.log('[LiveKit] Updating transcript with tradeUI for message:', message.id);
          setTranscript(prev => {
            const updated = prev.map(m =>
              m.id === message.id ? { ...m, tradeUI: data } : m
            );
            console.log('[LiveKit] Transcript updated, tradeUI attached:', updated.find(m => m.id === message.id)?.tradeUI ? 'yes' : 'no');
            return updated;
          });
        }
      }
    } else if (message.role === 'assistant' && convId) {
      // Save assistant messages to database
      console.log('[LiveKit] Saving assistant message to conversation:', convId);
      saveMessage(convId, message.role, message.content);
    }
  }, []); // Empty deps - uses refs to avoid stale closures

  // Text mode: send message
  const sendTextMessage = useCallback(async () => {
    if (!textInput.trim() || isSending) return;

    const query = textInput.trim();
    const convId = currentConversationIdRef.current;
    setIsSending(true);
    setTextInput('');

    // Add user message
    const userMsgId = `msg-${Date.now()}-user`;
    const userMsg: TranscriptMessage = {
      id: userMsgId,
      role: 'user',
      content: query,
      timestamp: new Date(),
    };
    setTranscript(prev => [...prev, userMsg]);

    if (convId) {
      saveMessage(convId, 'user', query);

      // Update title if first message
      if (!voiceTitleSetRef.current) {
        updateConversationTitle(convId, query.slice(0, 50));
        voiceTitleSetRef.current = true;
      }
    }

    try {
      // Classify intent and fetch UI data
      const intent = await classifyIntent(query);
      if (intent) {
        const symbol = intent.symbol || extractSymbol(query) || '';
        const data = await fetchTradeData(
          symbol,
          intent.cardType,
          intent.tradeType,
          intent.timePeriod,
          {
            callPut: intent.callPut,
            expiration: intent.expiration,
            accountQueryType: intent.accountQueryType,
            feeType: intent.feeType,
          }
        );

        // Generate a simple assistant response
        let assistantContent = "I've found the data you requested.";
        if (data) {
          if (data.type === 'detailed') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const apiData = data.data as { trades?: any[] };
            assistantContent = `Found ${apiData?.trades?.length || 0} trades for ${data.symbol}.`;
          } else if (data.type === 'account-balance') {
            assistantContent = "Here's your account information.";
          } else if (data.type === 'time-based') {
            assistantContent = `Here are your trades for ${data.timePeriod}.`;
          }

          setTranscript(prev => prev.map(m =>
            m.id === userMsgId ? { ...m, tradeUI: data } : m
          ));
        }

        // Add assistant message
        const assistantMsgId = `msg-${Date.now()}-assistant`;
        const assistantMsg: TranscriptMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: assistantContent,
          timestamp: new Date(),
        };
        setTranscript(prev => [...prev, assistantMsg]);

        if (convId) {
          saveMessage(convId, 'assistant', assistantContent);
        }
      }
    } catch (err) {
      console.error('Failed to process message:', err);
    } finally {
      setIsSending(false);
    }
  }, [textInput, isSending]); // Uses refs to avoid stale closures

  // Auto-scroll
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  // Format date for conversation list
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    if (days === 0) return `Today at ${timeStr}`;
    if (days === 1) return `Yesterday at ${timeStr}`;
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` at ${timeStr}`;
  };

  // Styles
  const styles = {
    widgetButton: {
      position: 'fixed' as const,
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 8px 8px 12px',
      background: colors.bgCard,
      borderRadius: '40px',
      border: `1px solid ${colors.border}`,
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
      cursor: 'pointer',
      zIndex: 9999,
      whiteSpace: 'nowrap' as const,
    },
    widgetOrb: {
      position: 'relative' as const,
      width: '32px',
      height: '32px',
      minWidth: '32px',
      borderRadius: '50%',
      background: `radial-gradient(circle at 50% 50%, #00ff08, ${colors.accent}, #008a04)`,
      boxShadow: 'inset 0 -2px 6px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 200, 6, 0.3)',
    },
    widgetOrbHighlight: {
      position: 'absolute' as const,
      top: '5px',
      left: '6px',
      width: '10px',
      height: '8px',
      borderRadius: '50%',
      background: 'rgba(255, 255, 255, 0.4)',
      filter: 'blur(1px)',
    },
    widgetOrbReflection: {
      position: 'absolute' as const,
      top: '3px',
      left: '5px',
      width: '5px',
      height: '4px',
      borderRadius: '50%',
      background: 'rgba(255, 255, 255, 0.7)',
    },
    widgetText: {
      color: colors.textSecondary,
      fontSize: '13px',
      fontWeight: 500,
    },
    widgetCallBtn: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '8px 14px',
      background: colors.bgHover,
      border: `1px solid ${colors.border}`,
      borderRadius: '24px',
      color: colors.textSecondary,
      fontSize: '13px',
      fontWeight: 500,
      cursor: 'pointer',
    },
    card: {
      position: 'fixed' as const,
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '420px',
      height: '650px',
      maxHeight: '90vh',
      display: 'flex',
      flexDirection: 'column' as const,
      backgroundColor: colors.bgCard,
      borderRadius: '16px',
      border: `1px solid ${colors.border}`,
      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.8)',
      overflow: 'hidden',
      zIndex: 9999,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      borderBottom: `1px solid ${colors.border}`,
      backgroundColor: colors.bgSecondary,
    },
    headerLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    backButton: {
      padding: '6px',
      backgroundColor: 'transparent',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      color: colors.textSecondary,
      display: 'flex',
      alignItems: 'center',
    },
    headerTitle: {
      color: colors.textPrimary,
      fontSize: '14px',
      fontWeight: 600,
    },
    modeButton: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 12px',
      fontSize: '13px',
      fontWeight: 500,
      color: colors.textSecondary,
      backgroundColor: colors.bgHover,
      border: `1px solid ${colors.border}`,
      borderRadius: '6px',
      cursor: 'pointer',
    },
    iconButton: {
      padding: '8px',
      backgroundColor: 'transparent',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      color: colors.textSecondary,
      display: 'flex',
      alignItems: 'center',
    },
    messagesContainer: {
      flex: 1,
      overflowY: 'auto' as const,
      padding: '16px',
      backgroundColor: colors.bgPrimary,
    },
    messageRow: {
      display: 'flex',
      gap: '12px',
      marginBottom: '16px',
    },
    avatar: {
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      backgroundColor: colors.accent,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: colors.bgPrimary,
      fontSize: '11px',
      fontWeight: 700,
      flexShrink: 0,
    },
    assistantBubble: {
      backgroundColor: colors.assistantBubble,
      borderRadius: '16px',
      borderTopLeftRadius: '4px',
      padding: '12px 16px',
      maxWidth: '300px',
    },
    userBubble: {
      backgroundColor: colors.userBubble,
      color: colors.bgPrimary,
      borderRadius: '16px',
      borderTopRightRadius: '4px',
      padding: '12px 16px',
      maxWidth: '280px',
      marginLeft: 'auto',
    },
    messageText: {
      fontSize: '14px',
      lineHeight: 1.5,
      margin: 0,
      whiteSpace: 'pre-wrap' as const,
    },
    inputArea: {
      padding: '16px',
      borderTop: `1px solid ${colors.border}`,
      backgroundColor: colors.bgSecondary,
    },
    inputForm: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '12px',
    },
    textInput: {
      width: '100%',
      padding: '12px 16px',
      fontSize: '14px',
      border: `1px solid ${colors.border}`,
      borderRadius: '8px',
      outline: 'none',
      backgroundColor: colors.bgCard,
      color: colors.textPrimary,
    },
    inputActions: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    endChatButton: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      fontSize: '13px',
      color: '#ff5000',
      backgroundColor: 'transparent',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
    },
    sendButton: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 20px',
      fontSize: '14px',
      fontWeight: 500,
      color: colors.bgPrimary,
      backgroundColor: colors.accent,
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
    },
    historyContainer: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column' as const,
      backgroundColor: colors.bgPrimary,
    },
    historyHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px',
      borderBottom: `1px solid ${colors.border}`,
    },
    historyTitle: {
      color: colors.textPrimary,
      fontSize: '16px',
      fontWeight: 600,
    },
    newChatButton: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '8px 16px',
      fontSize: '13px',
      fontWeight: 500,
      color: colors.bgPrimary,
      backgroundColor: colors.accent,
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
    },
    historyList: {
      flex: 1,
      overflowY: 'auto' as const,
      padding: '8px',
    },
    historyItem: {
      display: 'flex',
      flexDirection: 'column' as const,
      padding: '12px 16px',
      borderRadius: '8px',
      cursor: 'pointer',
      marginBottom: '4px',
      backgroundColor: 'transparent',
      border: 'none',
      width: '100%',
      textAlign: 'left' as const,
    },
    historyItemTitle: {
      color: colors.textPrimary,
      fontSize: '14px',
      fontWeight: 500,
      marginBottom: '4px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap' as const,
    },
    historyItemDate: {
      color: colors.textMuted,
      fontSize: '12px',
    },
    emptyHistory: {
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      color: colors.textMuted,
      fontSize: '14px',
      padding: '32px',
      textAlign: 'center' as const,
    },
  };

  // Closed state - floating widget
  if (!isOpen) {
    return (
      <div style={styles.widgetButton} onClick={handleOpen}>
        <div style={styles.widgetOrb}>
          <div style={styles.widgetOrbHighlight} />
          <div style={styles.widgetOrbReflection} />
        </div>
        <span style={styles.widgetText}>Need help?</span>
        <button style={styles.widgetCallBtn} onClick={(e) => { e.stopPropagation(); handleOpen(); }}>
          <Phone size={14} />
          Ask anything
        </button>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      {/* Minimize handle */}
      <div
        onClick={handleClose}
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '8px',
          cursor: 'pointer',
          backgroundColor: colors.bgSecondary,
        }}
      >
        <div style={{
          width: '36px',
          height: '4px',
          borderRadius: '2px',
          backgroundColor: colors.textMuted,
        }} />
      </div>

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          {currentView === 'chat' && (
            <button onClick={() => setCurrentView('history')} style={styles.backButton} title="Chat history">
              <History size={18} />
            </button>
          )}
          <span style={styles.headerTitle}>
            {currentView === 'history' ? 'Chat History' : 'AI Assistant'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {currentView === 'chat' && (
            <button onClick={toggleMode} style={styles.modeButton}>
              {inputMode === 'text' ? (
                <>
                  <Mic size={14} />
                  Voice
                </>
              ) : (
                <>
                  <MessageSquare size={14} />
                  Chat
                </>
              )}
            </button>
          )}
          <button onClick={handleClose} style={styles.iconButton}>
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Content */}
      {currentView === 'history' ? (
        // History view
        <div style={styles.historyContainer}>
          <div style={styles.historyHeader}>
            <span style={styles.historyTitle}>Recent Chats</span>
            <button onClick={handleNewChat} style={styles.newChatButton}>
              <Plus size={14} />
              New Chat
            </button>
          </div>
          <div style={styles.historyList}>
            {conversations.length === 0 ? (
              <div style={styles.emptyHistory}>
                <History size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                <p>No conversations yet</p>
                <p style={{ fontSize: '12px', marginTop: '8px' }}>Start a new chat to begin</p>
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv)}
                  style={{
                    ...styles.historyItem,
                    backgroundColor: conv.id === currentConversationId ? colors.bgHover : 'transparent',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgHover}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = conv.id === currentConversationId ? colors.bgHover : 'transparent'}
                >
                  <span style={styles.historyItemTitle}>{conv.title}</span>
                  <span style={styles.historyItemDate}>{formatDate(conv.updated_at)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : inputMode === 'text' ? (
        <>
          {/* Text Chat Messages */}
          <div ref={transcriptRef} style={styles.messagesContainer}>
            {/* Welcome Message */}
            {transcript.length === 0 && (
              <div style={styles.messageRow}>
                <div style={styles.avatar}>FA</div>
                <div style={styles.assistantBubble}>
                  <p style={{ ...styles.messageText, color: colors.textPrimary }}>
                    Hi, I&apos;m here to answer your questions about your portfolio. What would you like to know?
                  </p>
                </div>
              </div>
            )}

            {/* Messages */}
            {transcript.map((message) => (
              <div key={message.id}>
                <div
                  style={{
                    ...styles.messageRow,
                    justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  {message.role === 'assistant' && (
                    <div style={styles.avatar}>FA</div>
                  )}
                  <div style={message.role === 'user' ? styles.userBubble : styles.assistantBubble}>
                    <p style={{ ...styles.messageText, color: message.role === 'user' ? colors.bgPrimary : colors.textPrimary }}>
                      {message.content}
                    </p>
                  </div>
                </div>
                {/* Render trade UI if available */}
                {message.tradeUI && (
                  <TradeUICard
                    data={message.tradeUI}
                    onClose={() => setTranscript(prev => prev.map(m =>
                      m.id === message.id ? { ...m, tradeUI: undefined } : m
                    ))}
                  />
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {isSending && (
              <div style={styles.messageRow}>
                <div style={styles.avatar}>FA</div>
                <div style={styles.assistantBubble}>
                  <Loader2 size={16} style={{ color: colors.textSecondary, animation: 'spin 1s linear infinite' }} />
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div style={styles.inputArea}>
            <form onSubmit={(e) => { e.preventDefault(); sendTextMessage(); }} style={styles.inputForm}>
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Ask about your portfolio..."
                style={styles.textInput}
                disabled={isSending}
              />
              <div style={styles.inputActions}>
                <button type="button" onClick={handleEndChat} style={styles.endChatButton}>
                  <X size={14} />
                  End chat
                </button>
                <button
                  type="submit"
                  disabled={isSending || !textInput.trim()}
                  style={{
                    ...styles.sendButton,
                    opacity: isSending || !textInput.trim() ? 0.5 : 1,
                    cursor: isSending || !textInput.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Send size={14} />
                  Send
                </button>
              </div>
            </form>
          </div>
        </>
      ) : (
        /* Voice Mode */
        <>
          {!connectionDetails ? (
            // Not connected - show start button
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              padding: '32px',
              backgroundColor: colors.bgPrimary,
            }}>
              <div style={{
                width: '100px',
                height: '100px',
                borderRadius: '50%',
                background: `radial-gradient(circle at 50% 50%, #00ff08, ${colors.accent}, #008a04)`,
                boxShadow: '0 0 30px rgba(0, 200, 6, 0.4)',
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Mic size={40} color={colors.bgPrimary} />
              </div>
              <h3 style={{ color: colors.textPrimary, fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
                Voice Assistant
              </h3>
              <p style={{ color: colors.textMuted, fontSize: '14px', marginBottom: '24px', textAlign: 'center' }}>
                Talk to your AI trading assistant about trades, options, and more.
              </p>
              <button
                onClick={() => { void startSession(); }}
                disabled={isConnecting}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '14px 28px',
                  fontSize: '16px',
                  fontWeight: 600,
                  color: colors.bgPrimary,
                  backgroundColor: colors.accent,
                  border: 'none',
                  borderRadius: '24px',
                  cursor: isConnecting ? 'not-allowed' : 'pointer',
                  opacity: isConnecting ? 0.7 : 1,
                }}
              >
                {isConnecting ? (
                  <>
                    <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Phone size={18} />
                    Start Voice Call
                  </>
                )}
              </button>

              {/* Show existing transcript if any */}
              {transcript.length > 0 && (
                <div style={{ marginTop: '24px', width: '100%' }}>
                  <p style={{ color: colors.textMuted, fontSize: '12px', marginBottom: '12px' }}>
                    Previous conversation:
                  </p>
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {transcript.slice(-3).map(msg => (
                      <div key={msg.id} style={{
                        padding: '8px 12px',
                        marginBottom: '8px',
                        backgroundColor: colors.bgCard,
                        borderRadius: '8px',
                        fontSize: '13px',
                        color: colors.textSecondary,
                      }}>
                        <span style={{ fontWeight: 500, color: msg.role === 'user' ? colors.accent : colors.textPrimary }}>
                          {msg.role === 'user' ? 'You' : 'Assistant'}:
                        </span>{' '}
                        {msg.content.slice(0, 100)}{msg.content.length > 100 ? '...' : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            // Connected - show LiveKit room
            <LiveKitRoom
              serverUrl={connectionDetails.serverUrl}
              token={connectionDetails.participantToken}
              connect={true}
              audio={true}
              video={false}
              onDisconnected={endSession}
              style={{ display: 'flex', flexDirection: 'column', flex: 1 }}
            >
              <VoiceAssistantUI
                transcript={transcript}
                setTranscript={setTranscript}
                onMessageProcessed={handleMessageProcessed}
              />
            </LiveKitRoom>
          )}

          {/* End call button when connected */}
          {connectionDetails && (
            <div style={{
              padding: '12px 16px',
              borderTop: `1px solid ${colors.border}`,
              backgroundColor: colors.bgSecondary,
              display: 'flex',
              justifyContent: 'center',
            }}>
              <button
                onClick={endSession}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: colors.textPrimary,
                  backgroundColor: '#ff5000',
                  border: 'none',
                  borderRadius: '20px',
                  cursor: 'pointer',
                }}
              >
                <Phone size={14} />
                End Call
              </button>
            </div>
          )}
        </>
      )}

      {/* Keyframe animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}

export default LiveKitVoiceAssistant;
