// Intent Registry
// All intent definitions for GPT-based classification

import type { IntentDefinition } from '../types';

export const intentRegistry: IntentDefinition[] = [
  // === TRADES DOMAIN ===
  {
    id: 'trades.profitable',
    domain: 'trades',
    cardType: 'profitable',
    description: 'User asks about profitable trades, gains, winners, or profit/loss for a symbol',
    examples: [
      'Show my profitable trades for Apple',
      'What were my gains on TSLA?',
      'Did I make money on Google?',
      'Most profitable trade on SPY',
    ],
    requiredEntities: ['symbol'],
    optionalEntities: ['timePeriod'],
  },
  {
    id: 'trades.detailed',
    domain: 'trades',
    cardType: 'detailed',
    description: 'User wants to see all trades or trade history for a symbol',
    examples: [
      'Show my Apple trades',
      'List all TSLA trades',
      'What did I trade for Google?',
      'My Tesla trade history',
    ],
    requiredEntities: ['symbol'],
    optionalEntities: ['timePeriod', 'tradeType'],
  },
  {
    id: 'trades.time_based',
    domain: 'trades',
    cardType: 'time-based',
    description: 'User asks about trades during a specific time period (portfolio-wide or symbol-specific)',
    examples: [
      'What did I trade yesterday?',
      'Show trades from last week',
      'My trades this month',
      'What did I trade on Monday?',
      'AAPL trades last month',
    ],
    requiredEntities: ['timePeriod'],
    optionalEntities: ['symbol'],
  },
  {
    id: 'trades.stats',
    domain: 'trades',
    cardType: 'stats',
    description: 'User asks about price statistics: highest, lowest, average price paid or sold',
    examples: [
      'What was the highest price I sold Apple for?',
      'Lowest price I bought Tesla?',
      'Average buy price for NVDA this year',
      'What was my best sale price for SPY?',
    ],
    requiredEntities: ['symbol'],
    optionalEntities: ['tradeType', 'timePeriod'],
  },
  {
    id: 'trades.summary',
    domain: 'trades',
    cardType: 'summary',
    description: 'User asks how many trades they have for a symbol',
    examples: [
      'How many Apple trades do I have?',
      'Count my TSLA trades',
      'Number of Google trades',
    ],
    requiredEntities: ['symbol'],
    optionalEntities: [],
  },
  {
    id: 'trades.average_price',
    domain: 'trades',
    cardType: 'average-price',
    description: 'User specifically asks for average price only (not full stats)',
    examples: [
      'What was the average price I paid for Apple?',
      'Average cost basis for TSLA',
      'What did I average into Google at?',
    ],
    requiredEntities: ['symbol'],
    optionalEntities: ['tradeType', 'timePeriod'],
  },

  // === OPTIONS DOMAIN ===
  {
    id: 'options.bulk',
    domain: 'options',
    cardType: 'advanced-options',
    description: 'User asks about multiple option trades: all calls, all puts, short options, long options',
    examples: [
      'Show all my short calls on Tesla',
      'My put options on Apple',
      'All the calls I sold last month',
      'Long puts on SPY',
      'Option trades on NVDA',
    ],
    requiredEntities: [],
    optionalEntities: ['symbol', 'callPut', 'tradeType', 'timePeriod'],
  },
  {
    id: 'options.last_trade',
    domain: 'options',
    cardType: 'last-option',
    description: 'User asks about their last, most recent, or latest option trade',
    examples: [
      'Show my last call option on Apple',
      'Most recent put I bought',
      'Latest option trade on TSLA',
    ],
    requiredEntities: [],
    optionalEntities: ['symbol', 'callPut', 'tradeType'],
  },
  {
    id: 'options.expiring',
    domain: 'options',
    cardType: 'expiring-options',
    description: 'User asks about options expiring soon (tomorrow, this week, this month)',
    examples: [
      'What options expire tomorrow?',
      'Options expiring this week',
      'Do I have anything expiring this month?',
    ],
    requiredEntities: ['expiration'],
    optionalEntities: ['symbol'],
  },
  {
    id: 'options.highest_strike',
    domain: 'options',
    cardType: 'highest-strike',
    description: 'User asks about highest or lowest strike price option',
    examples: [
      'What was my highest strike call on Apple?',
      'Lowest strike put I sold',
    ],
    requiredEntities: ['callPut'],
    optionalEntities: ['symbol', 'tradeType'],
  },
  {
    id: 'options.total_premium',
    domain: 'options',
    cardType: 'total-premium',
    description: 'User asks about total premium collected or paid',
    examples: [
      'How much premium did I collect on SPY?',
      'Total premium paid for AAPL calls',
      'Premium collected last month',
    ],
    requiredEntities: [],
    optionalEntities: ['symbol', 'tradeType', 'timePeriod'],
  },

  // === ACCOUNT DOMAIN ===
  {
    id: 'account.summary',
    domain: 'account',
    cardType: 'account-balance',
    description: 'User asks about account balance, equity, buying power, margin, or general account info',
    examples: [
      'What is my account balance?',
      'How much buying power do I have?',
      'Show my account equity',
      'What is my margin requirement?',
      'Cash balance in my account',
      'Net liquidation value',
    ],
    requiredEntities: ['accountQueryType'],
    optionalEntities: ['timePeriod'],
  },

  // === FEES DOMAIN ===
  {
    id: 'fees.query',
    domain: 'fees',
    cardType: 'fees',
    description: 'User asks about fees, commissions, interest charges, or locate fees',
    examples: [
      'How much did I pay in commissions?',
      'Interest charges this month',
      'Locate fees for GME',
      'Total fees last year',
    ],
    requiredEntities: ['feeType'],
    optionalEntities: ['symbol', 'timePeriod'],
  },
];
