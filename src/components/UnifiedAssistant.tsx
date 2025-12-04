'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useConversation } from '@elevenlabs/react';
import { Mic, MessageSquare, X, Phone, Loader2, Plus, History, Send } from 'lucide-react';
import { TradesTable } from './generative-ui/TradesTable';
import { TradeSummary } from './generative-ui/TradeSummary';
import { TradeStats } from './generative-ui/TradeStats';
import { OptionStats } from './generative-ui/OptionStats';
import { ProfitableTrades } from './generative-ui/ProfitableTrades';
import { TimeBasedTrades } from './generative-ui/TimeBasedTrades';

type InputMode = 'voice' | 'text';
type View = 'chat' | 'history';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface TradeUIData {
  type: 'summary' | 'detailed' | 'stats' | 'profitable' | 'time-based' | 'option-stats';
  symbol: string;
  tradeType?: 'buy' | 'sell' | 'all';
  timePeriod?: string;
  data: unknown;
  optionData?: unknown; // For combined stock + option stats
}

interface TranscriptMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  tradeUI?: TradeUIData;
}

// App color scheme (dark theme)
const colors = {
  bgPrimary: '#000000',
  bgSecondary: '#0a0a0a',
  bgCard: '#1a1a1a',
  bgHover: '#2a2a2a',
  textPrimary: '#ffffff',
  textSecondary: '#8c8c8e',
  textMuted: '#5a5a5c',
  accent: '#00c806',
  accentHover: '#00a805',
  border: '#2a2a2a',
  userBubble: '#00c806',
  assistantBubble: '#2a2a2a',
};

// Extract stock symbol or company name from agent's response
function extractSymbolOrCompany(text: string): string | null {
  const commonWords = ['THE', 'FOR', 'AND', 'YOU', 'YOUR', 'ARE', 'HAS', 'HAVE', 'WAS', 'THIS', 'THAT', 'WITH', 'ANY', 'CLASS', 'BOTH', 'WERE', 'FIRST', 'TRADE', 'STOCK', 'TOTAL', 'PROFIT'];

  // Pattern 0: "profitable trades for Google" or "trades for AAPL"
  const tradesForMatch = text.match(/(?:profitable\s+)?trades?\s+for\s+(\w+)/i);
  if (tradesForMatch && !commonWords.includes(tradesForMatch[1].toUpperCase())) {
    return tradesForMatch[1];
  }

  // Pattern 1: "for GOOGL shares" or "AAPL trades" - ticker followed by shares/trades
  const tickerSharesMatch = text.match(/\b([A-Z]{2,5})\s+(?:shares|trades?|stock|position)/i);
  if (tickerSharesMatch && !commonWords.includes(tickerSharesMatch[1].toUpperCase())) {
    return tickerSharesMatch[1].toUpperCase();
  }

  // Pattern 2: "price for Google" or "paid for Apple"
  const priceForMatch = text.match(/(?:price|paid)\s+(?:for|of)\s+(\w+)/i);
  if (priceForMatch && !commonWords.includes(priceForMatch[1].toUpperCase())) {
    return priceForMatch[1];
  }

  // Pattern 3: "for Google this year" or "sold Tesla this year"
  const thisYearMatch = text.match(/(?:for|bought|sold)\s+(\w+)\s+(?:this year|in \d{4})/i);
  if (thisYearMatch && !commonWords.includes(thisYearMatch[1].toUpperCase())) {
    return thisYearMatch[1];
  }

  // Pattern 4: Look for standalone tickers (2-5 uppercase) that aren't common words
  const standaloneMatch = text.match(/\b([A-Z]{2,5})\b/g);
  if (standaloneMatch) {
    for (const match of standaloneMatch) {
      if (!commonWords.includes(match) && /^[A-Z]{2,5}$/.test(match)) {
        return match;
      }
    }
  }

  // Pattern 5: Company names like "Google", "Apple", "Tesla" etc
  const companyMatch = text.match(/\b(Google|Apple|Tesla|Amazon|Microsoft|Nvidia|Meta|Netflix|GameStop|Qualcomm|Intel|AMD)\b/i);
  if (companyMatch) {
    return companyMatch[1];
  }

  return null;
}

// Detect if message contains trade summary data (brief count)
function detectTradeSummary(text: string): { stockTrades: number; optionTrades: number } | null {
  // Skip if just checking/looking up
  const isJustChecking = /I'll check|let me check|checking your|retrieving|looking up|I'll help you find|I'll find|looking that up/i.test(text);
  if (isJustChecking && !/found|have|total/i.test(text)) return null;

  // Multiple patterns to match different response formats
  const patterns = [
    /(\d+)\s*stock\s*(?:trades?)?\s*(?:and)?\s*(\d+)\s*option\s*trades?/i,
    /have\s+(\d+)\s+stock\s+and\s+(\d+)\s+option\s+trades?/i,
    /(\d+)\s+stock\s+trades?\s+and\s+(\d+)\s+option/i,
    /found\s+(\d+)\s+stock\s+trades?\s+and\s+(\d+)\s+option/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        stockTrades: parseInt(match[1]) || 0,
        optionTrades: parseInt(match[2]) || 0,
      };
    }
  }
  return null;
}

// Detect if message contains detailed trades data
function detectDetailedTrades(text: string): boolean {
  // Skip if just checking/looking up
  const isJustChecking = /I'll check|let me check|checking your|retrieving|looking up|I'll help you find|I'll find|looking that up/i.test(text);
  if (isJustChecking && !/here are|detailed|total shares|total cost/i.test(text)) return false;

  // Check for detailed trade indicators
  const hasDetailedInfo =
    /detailed.*trades|total shares purchased|total cost.*\$|profit.?loss.*\$/i.test(text) ||
    /current value.*\$|here are your.*trades|showing.*trades/i.test(text);

  return hasDetailedInfo;
}

// Detect if message contains trade stats results (not just "let me check")
function detectTradeStats(text: string): { tradeType: 'buy' | 'sell' | 'all' } | null {
  // Skip messages that are just "checking" without actual price results
  const isJustChecking = /I'll check|let me check|checking your|retrieving|looking up|I'll help you find|I'll find|to find your|looking that up/i.test(text);

  // Check if message contains actual price data (either numeric or spelled out)
  const hasActualResult =
    /was\s+(?:\$[\d,]+|\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)/i.test(text) ||
    /(?:dollars?|cents?)\s+(?:and|per|for)/i.test(text) ||
    /\$[\d,]+\.?\d*/i.test(text) ||
    /highest price|lowest price|average price/i.test(text);

  // If it's just a "checking" message without results, skip
  if (isJustChecking && !hasActualResult) return null;

  // Must have some actual price/result to show the card
  if (!hasActualResult) return null;

  const patterns = [
    // Patterns for sell/sale results
    /highest.*(?:sale|sell|sold)/i,
    /(?:sale|sell|sold).*price/i,
    /lowest.*(?:sale|sell|sold)/i,
    // Patterns for buy/purchase results
    /highest.*(?:buy|bought|purchase|paid)/i,
    /lowest.*(?:buy|bought|purchase|paid)/i,
    /(?:buy|bought|purchase|paid).*price/i,
    /price.*(?:paid|bought)/i,
    // General patterns
    /average\s+(?:sell|buy|trade|sale|purchase)?\s*price/i,
    /trade\s+statistics/i,
    /highest\s+price.*\$/i,
    /lowest\s+price.*\$/i,
    /dollars?\s+(?:and|per)/i,
    /cents?\s+(?:per|for)/i,
    /statistics for \d{4}/i,
  ];

  if (patterns.some(p => p.test(text))) {
    // Determine trade type
    if (/sold|sell|sale/i.test(text)) return { tradeType: 'sell' };
    if (/bought|buy|purchase|paid/i.test(text)) return { tradeType: 'buy' };
    return { tradeType: 'all' };
  }
  return null;
}

// Detect if message contains profitable trades results
function detectProfitableTrades(text: string): boolean {
  // Skip messages that are just "checking" without actual results
  const isJustChecking = /I'll check|let me check|checking your|retrieving|looking up|I'll help you find|I'll find|to find your|looking that up/i.test(text);

  // Check if message contains actual profitable trades data
  const hasProfitableResult =
    (/profitable\s+trades?/i.test(text) || /profit.*trades/i.test(text)) && (
      /\$[\d,]+\.?\d*/i.test(text) || // Has dollar amount
      /\d+\s+profitable\s+trades?/i.test(text) || // Has count
      /total\s+profit/i.test(text) ||
      /profit\s+of/i.test(text) ||
      /total matched trades/i.test(text) ||
      /matched.*trades/i.test(text)
    );

  // If it's just a "checking" message without results, skip
  if (isJustChecking && !hasProfitableResult) return false;

  return hasProfitableResult;
}

// Detect if message contains time-based trades results
function detectTimeBasedTrades(text: string): { timePeriod: string } | null {
  // Skip messages that are just "checking" without actual results
  const isJustChecking = /I'll check|let me check|checking your|retrieving|looking up|I'll help you find|I'll find|to find your|looking that up/i.test(text);

  // Check for actual time-based results with trade counts
  const hasTradeCount = /executed\s+\d+\s+trades?|you\s+(?:have|had)\s+\d+\s+trades?|\d+\s+trades?\s+(?:for|on|over|during)|no trades found/i.test(text);

  if (isJustChecking && !hasTradeCount) return null;
  if (!hasTradeCount) return null;

  // Time period patterns to detect
  const timePatterns = [
    { pattern: /(?:for|on|over|during)\s+(today)/i, period: 'today' },
    { pattern: /(?:for|on|over|during)\s+(yesterday)/i, period: 'yesterday' },
    { pattern: /(?:for|on|over|during)\s+(?:the\s+)?(last\s+week|past\s+week)/i, period: 'last week' },
    { pattern: /(?:for|on|over|during)\s+(?:the\s+)?(this\s+week)/i, period: 'this week' },
    { pattern: /(?:for|on|over|during)\s+(?:the\s+)?(last\s+month|past\s+month)/i, period: 'last month' },
    { pattern: /(?:for|on|over|during)\s+(?:the\s+)?(this\s+month)/i, period: 'this month' },
    { pattern: /(?:for|on|over|during)\s+(?:the\s+)?(last\s+\d+\s+days?|past\s+\d+\s+days?)/i, period: null },
    { pattern: /(?:for|on|over|during)\s+(?:the\s+)?(last\s+\d+\s+trading\s+days?)/i, period: null },
    { pattern: /(?:on|for)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i, period: null },
    { pattern: /(\d+)\s+trading\s+days?/i, period: null },
    { pattern: /(yesterday|today|last week|this week|last month|this month)/i, period: null },
  ];

  for (const { pattern, period } of timePatterns) {
    const match = text.match(pattern);
    if (match) {
      const detectedPeriod = period || match[1].toLowerCase();
      return { timePeriod: detectedPeriod };
    }
  }

  return null;
}

const UnifiedAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [currentView, setCurrentView] = useState<View>('chat');
  const [inputValue, setInputValue] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  console.log('🎤 ElevenLabs Agent ID being used:', agentId);

  // Track if we've set a title for current voice conversation
  const voiceTitleSetRef = useRef(false);
  // Track if we're resuming from history (don't clear transcript)
  const isResumingFromHistoryRef = useRef(false);

  // Fetch trade data for UI rendering
  const fetchTradeData = useCallback(async (
    symbol: string,
    type: 'summary' | 'detailed' | 'stats' | 'profitable' | 'time-based' | 'option-stats',
    tradeType?: 'buy' | 'sell' | 'all',
    timePeriod?: string
  ): Promise<TradeUIData | null> => {
    try {
      let endpoint: string;
      let body: Record<string, unknown> = { symbol };

      if (type === 'summary') {
        endpoint = '/api/elevenlabs/trade-summary';
      } else if (type === 'stats') {
        // Fetch both stock stats and option stats
        const [stockRes, optionRes] = await Promise.all([
          fetch('/api/trade-stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol, tradeType: tradeType || 'all' }),
          }),
          fetch('/api/option-stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol, tradeType: tradeType || 'all' }),
          }),
        ]);
        const stockData = await stockRes.json();
        const optionData = await optionRes.json();
        return { type, symbol, tradeType, timePeriod, data: stockData, optionData };
      } else if (type === 'option-stats') {
        endpoint = '/api/option-stats';
        body = { symbol, tradeType: tradeType || 'all' };
      } else if (type === 'profitable') {
        endpoint = '/api/profitable-trades-ui';
      } else if (type === 'time-based') {
        endpoint = '/api/time-trades-ui';
        body = { symbol: symbol || null, timePeriod };
      } else {
        endpoint = '/api/elevenlabs/detailed-trades';
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      return { type, symbol, tradeType, timePeriod, data };
    } catch (error) {
      console.error('Error fetching trade data:', error);
      return null;
    }
  }, []);

  // ElevenLabs Conversation Hook - single source of truth for both voice and text
  const elevenLabsConversation = useConversation({
    onConnect: () => {
      console.log('ElevenLabs connected');
      // Only clear transcript if not resuming from history
      if (!isResumingFromHistoryRef.current) {
        setTranscript([]);
      }
      isResumingFromHistoryRef.current = false;
      voiceTitleSetRef.current = false; // Reset title tracking
      setIsSending(false);
    },
    onDisconnect: () => {
      console.log('ElevenLabs disconnected');
      setIsSending(false);
    },
    onMessage: async (message) => {
      if (message.message) {
        const role = message.source === 'user' ? 'user' : 'assistant';

        let tradeUI: TradeUIData | undefined;

        // For assistant messages, check if we should render trade UI
        if (role === 'assistant') {
          const symbol = extractSymbolOrCompany(message.message);
          console.log('🔍 Message:', message.message.substring(0, 100));
          console.log('🔍 Extracted symbol:', symbol);

          // Check for time-based trades first (highest priority for time queries)
          const timeMatch = detectTimeBasedTrades(message.message);
          if (timeMatch) {
            console.log('🔍 Time-based trades detected:', timeMatch.timePeriod);
            const data = await fetchTradeData(symbol || '', 'time-based', undefined, timeMatch.timePeriod);
            console.log('🔍 Fetched time-based data:', data);
            if (data) tradeUI = data;
          }
          // Check for profitable trades
          else if (symbol) {
            const isProfitable = detectProfitableTrades(message.message);
            console.log('🔍 Is profitable trades message:', isProfitable);
            if (isProfitable) {
              const data = await fetchTradeData(symbol, 'profitable');
              console.log('🔍 Fetched profitable data:', data);
              if (data) tradeUI = data;
            }
            // Check for trade stats (highest/lowest price queries)
            else {
              const statsMatch = detectTradeStats(message.message);
              if (statsMatch) {
                const data = await fetchTradeData(symbol, 'stats', statsMatch.tradeType);
                if (data) tradeUI = data;
              }
              // Check for detailed trades
              else if (detectDetailedTrades(message.message)) {
                const data = await fetchTradeData(symbol, 'detailed');
                if (data) tradeUI = data;
              }
              // Check for trade summary (stock/option breakdown)
              else {
                const summaryMatch = detectTradeSummary(message.message);
                if (summaryMatch) {
                  const data = await fetchTradeData(symbol, 'summary');
                  if (data) tradeUI = data;
                }
              }
            }
          }
        }

        const newMessage: TranscriptMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          role,
          content: message.message,
          timestamp: new Date(),
          tradeUI,
        };
        setTranscript(prev => [...prev, newMessage]);
        setIsSending(false); // Clear sending state when we get a response

        // Save to database - use refs/state updater to avoid stale closure
        setCurrentConversationId(prevConvId => {
          if (prevConvId) {
            saveMessage(prevConvId, role, message.message, inputMode);

            // Auto-generate title from first user message
            if (role === 'user' && !voiceTitleSetRef.current) {
              setConversations(prevConvs => {
                const conv = prevConvs.find(c => c.id === prevConvId);
                if (conv?.title === 'New Chat') {
                  updateConversationTitle(prevConvId, message.message.slice(0, 50));
                  voiceTitleSetRef.current = true;
                }
                return prevConvs;
              });
            }
          }
          return prevConvId; // Return unchanged
        });
      }
    },
    onError: (error) => {
      console.error('ElevenLabs error:', error);
      setIsSending(false);
    },
  });

  // API functions
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

  const loadConversationMessages = async (conversationId: string) => {
    try {
      const res = await fetch(`/api/messages?conversation_id=${conversationId}`);
      const data = await res.json();
      if (data.messages) {
        // Load messages into unified transcript, detecting trade UI for assistant messages
        const loadedMessages: TranscriptMessage[] = await Promise.all(
          data.messages.map(async (msg: { id: string; role: string; content: string; created_at: string }) => {
            const baseMessage: TranscriptMessage = {
              id: msg.id,
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
              timestamp: new Date(msg.created_at),
            };

            // For assistant messages, check if we should render trade UI
            if (msg.role === 'assistant') {
              const symbol = extractSymbolOrCompany(msg.content);

              // Check for time-based trades first
              const timeMatch = detectTimeBasedTrades(msg.content);
              if (timeMatch) {
                const tradeData = await fetchTradeData(symbol || '', 'time-based', undefined, timeMatch.timePeriod);
                if (tradeData) {
                  baseMessage.tradeUI = tradeData;
                }
              }
              else if (symbol) {
                // Check for profitable trades first
                const isProfitable = detectProfitableTrades(msg.content);
                if (isProfitable) {
                  const tradeData = await fetchTradeData(symbol, 'profitable');
                  if (tradeData) {
                    baseMessage.tradeUI = tradeData;
                  }
                }
                // Check for trade stats
                else {
                  const statsMatch = detectTradeStats(msg.content);
                  if (statsMatch) {
                    const tradeData = await fetchTradeData(symbol, 'stats', statsMatch.tradeType);
                    if (tradeData) {
                      baseMessage.tradeUI = tradeData;
                    }
                  }
                  // Check for detailed trades
                  else if (detectDetailedTrades(msg.content)) {
                    const tradeData = await fetchTradeData(symbol, 'detailed');
                    if (tradeData) {
                      baseMessage.tradeUI = tradeData;
                    }
                  }
                  // Check for trade summary
                  else {
                    const summaryMatch = detectTradeSummary(msg.content);
                    if (summaryMatch) {
                      const tradeData = await fetchTradeData(symbol, 'summary');
                      if (tradeData) {
                        baseMessage.tradeUI = tradeData;
                      }
                    }
                  }
                }
              }
            }

            return baseMessage;
          })
        );
        setTranscript(loadedMessages);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const saveMessage = async (conversationId: string, role: string, content: string, source: string) => {
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, role, content, source }),
      });
    } catch (error) {
      console.error('Failed to save message:', error);
    }
  };

  const updateConversationTitle = async (conversationId: string, title: string) => {
    try {
      await fetch(`/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, title } : c))
      );
    } catch (error) {
      console.error('Failed to update conversation title:', error);
    }
  };

  // Auto-scroll for transcript
  useEffect(() => {
    if (transcriptRef.current && transcript.length > 0) {
      // Use setTimeout to ensure DOM has fully updated after render
      const timeoutId = setTimeout(() => {
        if (transcriptRef.current) {
          transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
        }
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [transcript]);

  useEffect(() => {
    if (isOpen && inputMode === 'text' && inputRef.current && currentView === 'chat') {
      inputRef.current.focus();
    }
  }, [isOpen, inputMode, currentView]);

  useEffect(() => {
    if (isOpen) fetchConversations();
  }, [isOpen]);

  // Voice session handlers
  const startVoiceSession = useCallback(async () => {
    if (elevenLabsConversation.status === 'connected' || elevenLabsConversation.status === 'connecting') {
      return;
    }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      // @ts-expect-error - ElevenLabs SDK types
      await elevenLabsConversation.startSession({ agentId });
    } catch (error) {
      console.error('Failed to start voice session:', error);
    }
  }, [elevenLabsConversation, agentId]);

  const stopVoiceSession = useCallback(async () => {
    if (elevenLabsConversation.status === 'connected') {
      await elevenLabsConversation.endSession();
    }
  }, [elevenLabsConversation]);

  // Handlers
  const handleOpen = useCallback(async () => {
    setIsOpen(true);
    setInputMode('voice'); // Always open in voice mode
    setCurrentView('chat');
    if (!currentConversationId) {
      const newId = await createConversation();
      if (newId) setCurrentConversationId(newId);
    }
    // Auto-start voice session
    if (elevenLabsConversation.status !== 'connected' && elevenLabsConversation.status !== 'connecting') {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        // @ts-expect-error - ElevenLabs SDK types
        await elevenLabsConversation.startSession({ agentId });
      } catch (error) {
        console.error('Failed to auto-start voice session:', error);
      }
    }
  }, [currentConversationId, elevenLabsConversation, agentId]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    stopVoiceSession();
  }, [stopVoiceSession]);

  const handleSelectConversation = async (conv: Conversation) => {
    isResumingFromHistoryRef.current = true; // Don't clear transcript when voice connects
    setCurrentConversationId(conv.id);
    await loadConversationMessages(conv.id);
    setCurrentView('chat');
  };

  const handleNewChat = async () => {
    setTranscript([]);
    const newId = await createConversation();
    if (newId) {
      setCurrentConversationId(newId);
      setCurrentView('chat');
    }
  };

  const handleSendMessage = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() || isSending) return;

    const message = inputValue.trim();
    setInputValue('');
    setIsSending(true);

    // Ensure ElevenLabs session is connected
    if (elevenLabsConversation.status !== 'connected') {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        // @ts-expect-error - ElevenLabs SDK types
        await elevenLabsConversation.startSession({ agentId });
        // Wait a moment for connection to establish
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error('Failed to start ElevenLabs session:', error);
        setIsSending(false);
        return;
      }
    }

    let convId = currentConversationId;
    if (!convId) {
      convId = await createConversation(message.slice(0, 50));
      if (convId) setCurrentConversationId(convId);
    }

    // Add user message to transcript immediately for UI feedback
    const userMessage: TranscriptMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'user',
      content: message,
      timestamp: new Date(),
    };
    setTranscript(prev => [...prev, userMessage]);

    // Save to database
    if (convId) {
      await saveMessage(convId, 'user', message, 'text');
      const currentConv = conversations.find((c) => c.id === convId);
      if (currentConv?.title === 'New Chat') {
        updateConversationTitle(convId, message.slice(0, 50));
        voiceTitleSetRef.current = true;
      }
    }

    // Send message to ElevenLabs agent
    elevenLabsConversation.sendUserMessage(message);
  }, [inputValue, isSending, currentConversationId, conversations, elevenLabsConversation, agentId]);

  const handleEndChat = useCallback(() => {
    setTranscript([]);
    setCurrentConversationId(null);
    setCurrentView('history');
    stopVoiceSession();
  }, [stopVoiceSession]);

  const toggleMode = () => {
    const newMode = inputMode === 'text' ? 'voice' : 'text';
    setInputMode(newMode);
    // Both modes use the same ElevenLabs session, so just start it if not connected
    if (elevenLabsConversation.status !== 'connected' && elevenLabsConversation.status !== 'connecting') {
      startVoiceSession();
    }
  };

  // Render trade UI component based on data
  const renderTradeUI = (tradeUI: TradeUIData) => {
    const { type, symbol, data } = tradeUI;

    if (type === 'summary') {
      // Parse from the response data
      const responseData = data as { response?: string };
      const text = responseData.response || '';
      const summaryMatch = detectTradeSummary(text);

      if (summaryMatch) {
        return (
          <div style={{ marginTop: '12px' }}>
            <TradeSummary
              symbol={symbol}
              stockCount={summaryMatch.stockTrades}
              optionCount={summaryMatch.optionTrades}
            />
          </div>
        );
      }
    }

    if (type === 'detailed') {
      // For detailed trades, we need to fetch the full data with trades array
      // The API returns a text response, but we need to call a different endpoint
      // that returns structured data for the table
      return (
        <div style={{ marginTop: '12px' }}>
          <DetailedTradesLoader symbol={symbol} />
        </div>
      );
    }

    if (type === 'stats') {
      const stockStatsData = data as { stats?: {
        symbol: string;
        year: number;
        tradeType: 'buy' | 'sell' | 'all';
        highestPrice: number;
        highestPriceDate: string;
        highestPriceShares: number;
        lowestPrice: number;
        lowestPriceDate: string;
        lowestPriceShares: number;
        averagePrice: number;
        totalTrades: number;
        totalShares: number;
        totalValue: number;
      }};

      const optionStatsData = tradeUI.optionData as { optionStats?: {
        symbol: string;
        year: number;
        tradeType: 'buy' | 'sell' | 'all';
        highestPremium: number;
        highestPremiumDate: string;
        highestPremiumContracts: number;
        highestPremiumStrike: number;
        highestPremiumCallPut: 'Call' | 'Put';
        lowestPremium: number;
        lowestPremiumDate: string;
        lowestPremiumContracts: number;
        lowestPremiumStrike: number;
        lowestPremiumCallPut: 'Call' | 'Put';
        averagePremium: number;
        totalTrades: number;
        totalContracts: number;
        totalValue: number;
        callCount: number;
        putCount: number;
      }} | null;

      const hasStockStats = stockStatsData?.stats;
      const hasOptionStats = optionStatsData?.optionStats;

      if (hasStockStats || hasOptionStats) {
        return (
          <div style={{ marginTop: '12px' }}>
            {hasStockStats && (
              <TradeStats
                symbol={stockStatsData.stats!.symbol}
                year={stockStatsData.stats!.year}
                tradeType={stockStatsData.stats!.tradeType}
                highestPrice={stockStatsData.stats!.highestPrice}
                highestPriceDate={stockStatsData.stats!.highestPriceDate}
                highestPriceShares={stockStatsData.stats!.highestPriceShares}
                lowestPrice={stockStatsData.stats!.lowestPrice}
                lowestPriceDate={stockStatsData.stats!.lowestPriceDate}
                lowestPriceShares={stockStatsData.stats!.lowestPriceShares}
                averagePrice={stockStatsData.stats!.averagePrice}
                totalTrades={stockStatsData.stats!.totalTrades}
                totalShares={stockStatsData.stats!.totalShares}
                totalValue={stockStatsData.stats!.totalValue}
              />
            )}
            {hasOptionStats && (
              <OptionStats
                symbol={optionStatsData.optionStats!.symbol}
                year={optionStatsData.optionStats!.year}
                tradeType={optionStatsData.optionStats!.tradeType}
                highestPremium={optionStatsData.optionStats!.highestPremium}
                highestPremiumDate={optionStatsData.optionStats!.highestPremiumDate}
                highestPremiumContracts={optionStatsData.optionStats!.highestPremiumContracts}
                highestPremiumStrike={optionStatsData.optionStats!.highestPremiumStrike}
                highestPremiumCallPut={optionStatsData.optionStats!.highestPremiumCallPut}
                lowestPremium={optionStatsData.optionStats!.lowestPremium}
                lowestPremiumDate={optionStatsData.optionStats!.lowestPremiumDate}
                lowestPremiumContracts={optionStatsData.optionStats!.lowestPremiumContracts}
                lowestPremiumStrike={optionStatsData.optionStats!.lowestPremiumStrike}
                lowestPremiumCallPut={optionStatsData.optionStats!.lowestPremiumCallPut}
                averagePremium={optionStatsData.optionStats!.averagePremium}
                totalTrades={optionStatsData.optionStats!.totalTrades}
                totalContracts={optionStatsData.optionStats!.totalContracts}
                totalValue={optionStatsData.optionStats!.totalValue}
                callCount={optionStatsData.optionStats!.callCount}
                putCount={optionStatsData.optionStats!.putCount}
              />
            )}
          </div>
        );
      }
    }

    if (type === 'profitable') {
      console.log('🎨 Rendering profitable trades card with data:', data);
      const profitableData = data as {
        symbol: string;
        totalProfitableTrades: number;
        totalProfit: number;
        trades: Array<{
          securityType: string;
          buyDate: string;
          sellDate: string;
          quantity: number;
          buyPrice: number;
          sellPrice: number;
          profitLoss: number;
        }>;
      };

      // Always render if we have data, even with 0 trades (to show "no profitable trades")
      if (profitableData.symbol) {
        return (
          <div style={{ marginTop: '12px' }}>
            <ProfitableTrades
              symbol={profitableData.symbol}
              totalProfitableTrades={profitableData.totalProfitableTrades || 0}
              totalProfit={profitableData.totalProfit || 0}
              trades={profitableData.trades || []}
            />
          </div>
        );
      }
    }

    if (type === 'time-based') {
      console.log('🎨 Rendering time-based trades card with data:', data);
      const timeData = data as {
        timePeriod: {
          description: string;
          displayRange: string;
          tradingDays: number;
        };
        summary: {
          totalTrades: number;
          stockCount: number;
          optionCount: number;
          totalValue: number;
          averagePrice?: number;
        };
        trades: Array<{
          TradeID: number;
          Date: string;
          Symbol: string;
          SecurityType: string;
          TradeType: string;
          StockTradePrice?: string;
          StockShareQty?: string;
          OptionContracts?: string;
          NetAmount: string;
          displayDate?: string;
        }>;
        symbol?: string | null;
      };

      if (timeData.timePeriod && timeData.summary) {
        return (
          <div style={{ marginTop: '12px' }}>
            <TimeBasedTrades
              timePeriod={timeData.timePeriod}
              summary={timeData.summary}
              trades={timeData.trades || []}
              symbol={timeData.symbol}
            />
          </div>
        );
      }
    }

    return null;
  };

  const isVoiceConnected = elevenLabsConversation.status === 'connected';
  const isVoiceConnecting = elevenLabsConversation.status === 'connecting';
  const isStreaming = isSending;

  // Format date for conversation list with time
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

  // Styles (dark theme matching app)
  const styles = {
    // Floating widget button (pill style like screenshot)
    widgetButton: {
      position: 'fixed' as const,
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '8px 8px 8px 12px',
      background: colors.bgCard,
      borderRadius: '40px',
      border: `1px solid ${colors.border}`,
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
      cursor: 'pointer',
      zIndex: 9999,
    },
    widgetOrb: {
      position: 'relative' as const,
      width: '40px',
      height: '40px',
      borderRadius: '50%',
      background: `radial-gradient(circle at 50% 50%, #00ff08, ${colors.accent}, #008a04)`,
      boxShadow: 'inset 0 -2px 6px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 200, 6, 0.3)',
    },
    widgetOrbHighlight: {
      position: 'absolute' as const,
      top: '6px',
      left: '8px',
      width: '12px',
      height: '10px',
      borderRadius: '50%',
      background: 'rgba(255, 255, 255, 0.4)',
      filter: 'blur(1px)',
    },
    widgetOrbReflection: {
      position: 'absolute' as const,
      top: '4px',
      left: '6px',
      width: '6px',
      height: '5px',
      borderRadius: '50%',
      background: 'rgba(255, 255, 255, 0.7)',
    },
    widgetText: {
      color: colors.textSecondary,
      fontSize: '14px',
      fontWeight: 500,
    },
    widgetCallBtn: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 20px',
      background: colors.bgHover,
      border: `1px solid ${colors.border}`,
      borderRadius: '24px',
      color: colors.textSecondary,
      fontSize: '14px',
      fontWeight: 500,
      cursor: 'pointer',
    },
    // Main card - centered on screen
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
    // Header
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
    // Messages
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
    // Input area
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
    // History view
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
                {message.tradeUI && renderTradeUI(message.tradeUI)}
              </div>
            ))}

            {/* Typing indicator */}
            {isStreaming && (
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
            <form onSubmit={handleSendMessage} style={styles.inputForm}>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about your portfolio..."
                style={styles.textInput}
                disabled={isStreaming}
              />
              <div style={styles.inputActions}>
                <button type="button" onClick={handleEndChat} style={styles.endChatButton}>
                  <X size={14} />
                  End chat
                </button>
                <button
                  type="submit"
                  disabled={isStreaming || !inputValue.trim()}
                  style={{
                    ...styles.sendButton,
                    opacity: isStreaming || !inputValue.trim() ? 0.5 : 1,
                    cursor: isStreaming || !inputValue.trim() ? 'not-allowed' : 'pointer',
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
        /* Voice Mode - Chat-style with transcript */
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
                background: isVoiceConnected
                  ? `radial-gradient(circle at 50% 50%, #00ff08, ${colors.accent}, #008a04)`
                  : colors.bgHover,
                boxShadow: isVoiceConnected ? '0 0 12px rgba(0, 200, 6, 0.5)' : 'none',
                animation: isVoiceConnected && elevenLabsConversation.isSpeaking ? 'pulse 1s infinite' : 'none',
              }}>
                <div style={{
                  position: 'absolute',
                  top: '5px',
                  left: '6px',
                  width: '8px',
                  height: '6px',
                  borderRadius: '50%',
                  background: isVoiceConnected ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.2)',
                }} />
              </div>
              <div>
                <div style={{ color: colors.textPrimary, fontSize: '14px', fontWeight: 600 }}>
                  {isVoiceConnected ? (elevenLabsConversation.isSpeaking ? 'Speaking...' : 'Listening...') : 'Voice Call'}
                </div>
                <div style={{ color: colors.textMuted, fontSize: '12px' }}>
                  {isVoiceConnected ? 'Say something to talk' : 'Start a call to begin'}
                </div>
              </div>
            </div>
            {isVoiceConnected ? (
              <button onClick={stopVoiceSession} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 500,
                color: colors.textPrimary,
                backgroundColor: '#ff5000',
                border: 'none',
                borderRadius: '20px',
                cursor: 'pointer',
              }}>
                <Phone size={14} />
                End
              </button>
            ) : (
              <button onClick={startVoiceSession} disabled={isVoiceConnecting} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 500,
                color: colors.bgPrimary,
                backgroundColor: colors.accent,
                border: 'none',
                borderRadius: '20px',
                cursor: isVoiceConnecting ? 'not-allowed' : 'pointer',
                opacity: isVoiceConnecting ? 0.7 : 1,
              }}>
                {isVoiceConnecting ? (
                  <>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    Connecting
                  </>
                ) : (
                  <>
                    <Phone size={14} />
                    Call
                  </>
                )}
              </button>
            )}
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
                  {isVoiceConnected ? 'Start speaking...' : 'Click "Call" to start a voice conversation'}
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
                      }}>
                        <p style={{ fontSize: '14px', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>
                          {msg.content}
                        </p>
                      </div>
                    </div>
                    {/* Render trade UI if available */}
                    {msg.tradeUI && renderTradeUI(msg.tradeUI)}
                  </div>
                ))}
                {/* Scroll anchor */}
                <div style={{ height: '1px' }} />
              </>
            )}
          </div>

          {/* Text Input for Voice Mode */}
          <div style={{
            padding: '12px 16px',
            borderTop: `1px solid ${colors.border}`,
            backgroundColor: colors.bgSecondary,
            flexShrink: 0,
          }}>
            <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
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
                disabled={!inputValue.trim() || isSending}
                style={{
                  padding: '10px 16px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: colors.bgPrimary,
                  backgroundColor: colors.accent,
                  border: 'none',
                  borderRadius: '8px',
                  cursor: inputValue.trim() && !isSending ? 'pointer' : 'not-allowed',
                  opacity: inputValue.trim() && !isSending ? 1 : 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        </div>
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
};

// Component to load detailed trades data
function DetailedTradesLoader({ symbol }: { symbol: string }) {
  const [tradesData, setTradesData] = useState<{
    trades: Array<{
      TradeID: number;
      Date: string;
      Symbol: string;
      SecurityType: string;
      TradeType: string;
      StockTradePrice: string;
      StockShareQty: string;
      OptionContracts: string;
      OptionTradePremium: string;
      GrossAmount: string;
      NetAmount: string;
      Strike?: string;
      Expiration?: string;
      'Call/Put'?: string;
    }>;
    summary: {
      totalShares: number;
      totalCost: number;
      currentValue: number;
      symbol: string;
    };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/trades-ui', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol }),
        });
        const data = await res.json();
        if (data.trades) {
          setTradesData(data);
        }
      } catch (error) {
        console.error('Error loading trades:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [symbol]);

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#8c8c8e' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ marginTop: '8px', fontSize: '14px' }}>Loading trades...</p>
      </div>
    );
  }

  if (!tradesData) {
    return null;
  }

  return <TradesTable trades={tradesData.trades} summary={tradesData.summary} />;
}

export default UnifiedAssistant;
