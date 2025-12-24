'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { X, Send, Loader2, Mic, Phone, History, Plus, MessageSquare } from 'lucide-react';
import { useConversation } from '@elevenlabs/react';

// CSS keyframes for pulse animation
const pulseKeyframes = `
@keyframes pulse {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 0 20px rgba(0, 200, 6, 0.6), 0 0 40px rgba(0, 200, 6, 0.3);
  }
  50% {
    transform: scale(1.05);
    box-shadow: 0 0 30px rgba(0, 200, 6, 0.8), 0 0 60px rgba(0, 200, 6, 0.4);
  }
}
`;

// Inject keyframes into document
if (typeof document !== 'undefined') {
  const styleId = 'ai-chat-assistant-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = pulseKeyframes;
    document.head.appendChild(style);
  }
}

// Import generative UI components
import { TradesTable } from './generative-ui/TradesTable';
import { TradeSummary } from './generative-ui/TradeSummary';
import { ProfitableTrades } from './generative-ui/ProfitableTrades';
import { TimeBasedTrades } from './generative-ui/TimeBasedTrades';
import { AccountSummary, type AccountQueryType } from './generative-ui/AccountSummary';
import { FeesSummary, type FeeType } from './generative-ui/FeesSummary';
import { TradeApproval } from './generative-ui/TradeApproval';

type View = 'chat' | 'history';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
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

// Tool output type definitions matching our API response shapes
interface FeesToolOutput {
  feeType: FeeType;
  totalAmount: number;
  transactionCount: number;
  timePeriod: string;
  symbol?: string;
  response: string;
  breakdown?: Array<{ date: string; amount: number; symbol?: string }>;
  suggestion?: { period: string; amount: number } | null;
}

interface AccountBalanceToolOutput {
  queryType: AccountQueryType;
  asOfDate?: string;
  timePeriod?: string;
  response: string;
  cashBalance?: number;
  accountEquity?: number;
  dayTradingBP?: number;
  stockLMV?: number;
  stockSMV?: number;
  optionsLMV?: number;
  optionsSMV?: number;
  avgBalance?: number;
  maxBalance?: number;
  minBalance?: number;
  maxBalanceDate?: string;
  minBalanceDate?: string;
  suggestion?: { period: string } | null;
}

interface TimeTradesToolOutput {
  timePeriod: string;
  symbol?: string;
  totalTrades: number;
  stockCount?: number;
  optionCount?: number;
  totalValue?: number;
  response: string;
  trades?: Array<{
    TradeID: number;
    Date: string;
    Symbol: string;
    TradeType: string;
    SecurityType: string;
    StockShareQty?: string;
    OptionContracts?: string;
    StockTradePrice?: string;
    OptionTradePremium?: string;
    NetAmount: string;
  }>;
  suggestion?: { period: string; count: number } | null;
}

interface DetailedTradesToolOutput {
  symbol: string;
  summary?: {
    totalSharesPurchased: number;
    totalCost: number;
    currentValue: number;
    lastTradePrice: number;
    profitLoss: number;
    profitLossPercent: number;
  };
  stockTrades?: Array<{
    tradeId: string;
    date: string;
    type: string;
    shares: number;
    price: number;
    netAmount: number;
  }>;
  optionTrades?: Array<{
    tradeId: string;
    date: string;
    type: string;
    callPut: string;
    strike: number;
    expiration: string;
    contracts: number;
    premium: number;
    netAmount: number;
  }>;
  stockTradeCount: number;
  optionTradeCount: number;
}

interface ProfitableTradesToolOutput {
  symbol: string;
  totalProfitableTrades: number;
  totalProfit: number;
  response: string;
  trades?: Array<{
    securityType: string;
    buyDate: string;
    sellDate: string;
    quantity: number;
    buyPrice: number;
    sellPrice: number;
    profitLoss: number;
  }>;
}

interface TradeSummaryToolOutput {
  symbol: string;
  stockTrades: number;
  optionTrades: number;
  warrantTrades: number;
  totalTrades: number;
}

// Component to render tool output as UI card
function ToolOutputCard({ toolName, output }: { toolName: string; output: unknown }) {
  switch (toolName) {
    case 'getFees': {
      const data = output as FeesToolOutput;
      if (!data || data.totalAmount === undefined) return null;

      return (
        <div style={{ marginTop: '12px' }}>
          <FeesSummary
            feeType={data.feeType}
            totalAmount={data.totalAmount}
            transactionCount={data.transactionCount}
            timePeriod={data.timePeriod}
            symbol={data.symbol}
            breakdown={data.breakdown}
            suggestion={data.suggestion ? {
              period: data.suggestion.period,
              amount: data.suggestion.amount,
              count: data.transactionCount,
              startDate: '',
              endDate: '',
            } : undefined}
          />
        </div>
      );
    }

    case 'getAccountBalance': {
      const data = output as AccountBalanceToolOutput;
      if (!data || !data.queryType) return null;

      return (
        <div style={{ marginTop: '12px' }}>
          <AccountSummary
            queryType={data.queryType}
            date={data.asOfDate || ''}
            cashBalance={data.cashBalance}
            accountEquity={data.accountEquity}
            dayTradingBP={data.dayTradingBP}
            stockLMV={data.stockLMV}
            stockSMV={data.stockSMV}
            optionsLMV={data.optionsLMV}
            optionsSMV={data.optionsSMV}
          />
        </div>
      );
    }

    case 'getTimeTrades': {
      const data = output as TimeTradesToolOutput;
      if (!data) return null;

      return (
        <div style={{ marginTop: '12px' }}>
          <TimeBasedTrades
            timePeriod={{
              description: data.timePeriod,
              displayRange: data.timePeriod,
              tradingDays: 0,
            }}
            summary={{
              totalTrades: data.totalTrades,
              stockCount: data.stockCount || 0,
              optionCount: data.optionCount || 0,
              totalValue: data.totalValue || 0,
            }}
            trades={data.trades || []}
            symbol={data.symbol}
          />
        </div>
      );
    }

    case 'getDetailedTrades': {
      const data = output as DetailedTradesToolOutput;
      if (!data || !data.symbol) return null;

      // Convert stock trades to TradesTable format with all required fields
      const trades = [
        ...(data.stockTrades || []).map((t, i) => ({
          TradeID: i,
          Date: t.date,
          Symbol: data.symbol,
          TradeType: t.type === 'Buy' ? 'B' : 'S',
          SecurityType: 'S',
          StockShareQty: String(t.shares),
          StockTradePrice: String(t.price),
          OptionContracts: '0',
          OptionTradePremium: '0',
          GrossAmount: String(t.netAmount),
          NetAmount: String(t.netAmount),
        })),
        ...(data.optionTrades || []).map((t, i) => ({
          TradeID: 1000 + i,
          Date: t.date,
          Symbol: data.symbol,
          TradeType: t.type === 'Buy' ? 'B' : 'S',
          SecurityType: 'O',
          StockShareQty: '0',
          StockTradePrice: '0',
          OptionContracts: String(t.contracts),
          OptionTradePremium: String(t.premium),
          GrossAmount: String(t.netAmount),
          NetAmount: String(t.netAmount),
          Strike: String(t.strike),
          Expiration: t.expiration,
          'Call/Put': t.callPut === 'Call' ? 'C' : 'P',
        })),
      ];

      return (
        <div style={{ marginTop: '12px' }}>
          <TradesTable trades={trades} />
        </div>
      );
    }

    case 'getProfitableTrades': {
      const data = output as ProfitableTradesToolOutput;
      if (!data || !data.symbol) return null;

      return (
        <div style={{ marginTop: '12px' }}>
          <ProfitableTrades
            symbol={data.symbol}
            totalProfitableTrades={data.totalProfitableTrades}
            totalProfit={data.totalProfit}
            trades={data.trades || []}
          />
        </div>
      );
    }

    case 'getTradeSummary': {
      const data = output as TradeSummaryToolOutput;
      if (!data || !data.symbol) return null;

      return (
        <div style={{ marginTop: '12px' }}>
          <TradeSummary
            symbol={data.symbol}
            stockCount={data.stockTrades}
            optionCount={data.optionTrades}
          />
        </div>
      );
    }

    default:
      return null;
  }
}

type InputMode = 'text' | 'voice';

export const AIChatAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentView, setCurrentView] = useState<View>('chat');
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [input, setInput] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // AI SDK useChat hook - the single source of truth
  const {
    messages,
    sendMessage,
    status,
    error,
    addToolApprovalResponse,
  } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  });

  // Derive isLoading from status
  const isLoading = status === 'submitted' || status === 'streaming';

  // ElevenLabs for voice I/O only
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  const elevenLabs = useConversation({
    onMessage: (message) => {
      // When ElevenLabs receives voice, convert to text and send to AI SDK
      if (message.source === 'user' && message.message) {
        // Send the transcribed text to AI SDK
        sendMessage({ text: message.message });
      }
    },
    onError: (err) => {
      console.error('ElevenLabs error:', err);
    },
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens (works in both text and voice modes)
  useEffect(() => {
    if (isOpen && currentView === 'chat') {
      inputRef.current?.focus();
    }
  }, [isOpen, currentView]);

  // Fetch conversations when panel opens
  useEffect(() => {
    if (isOpen) fetchConversations();
  }, [isOpen]);

  // Conversation API functions
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

  // Voice session functions
  const startVoiceSession = useCallback(async () => {
    if (!agentId) {
      console.error('No ElevenLabs agent ID configured');
      return;
    }
    if (elevenLabs.status === 'connected' || elevenLabs.status === 'connecting') {
      return;
    }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      // @ts-expect-error - ElevenLabs SDK types don't expose all options
      await elevenLabs.startSession({ agentId });
      console.log('🟢 Voice session started with agent:', agentId);
    } catch (error) {
      console.error('Failed to start voice session:', error);
    }
  }, [elevenLabs, agentId]);

  const stopVoiceSession = useCallback(async () => {
    if (elevenLabs.status === 'connected') {
      try {
        await elevenLabs.endSession();
        console.log('🔴 Voice session ended');
      } catch (e) {
        console.log('Voice session end:', e);
      }
    }
  }, [elevenLabs]);

  // Toggle between voice and text mode
  const toggleMode = useCallback(async () => {
    if (inputMode === 'voice') {
      await stopVoiceSession();
      setInputMode('text');
    } else {
      await startVoiceSession();
      setInputMode('voice');
    }
  }, [inputMode, startVoiceSession, stopVoiceSession]);

  // Handler to open the assistant panel
  const handleOpen = useCallback(async () => {
    setIsOpen(true);
    setCurrentView('chat');
    setInputMode('voice'); // Default to voice mode

    // Create new conversation if none exists
    if (!currentConversationId) {
      const newId = await createConversation();
      if (newId) setCurrentConversationId(newId);
    }

    // Auto-start voice session
    if (agentId && elevenLabs.status !== 'connected' && elevenLabs.status !== 'connecting') {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        // @ts-expect-error - ElevenLabs SDK types don't expose all options
        await elevenLabs.startSession({ agentId });
        console.log('🟢 Voice session auto-started on open');
      } catch (error) {
        console.error('Failed to auto-start voice session:', error);
        setInputMode('text'); // Fallback to text mode
      }
    }
  }, [currentConversationId, elevenLabs, agentId]);

  // Handler to close the assistant panel
  const handleClose = useCallback(async () => {
    setIsOpen(false);
    await stopVoiceSession();
  }, [stopVoiceSession]);

  // Handler to select a conversation from history
  const handleSelectConversation = async (conv: Conversation) => {
    setCurrentConversationId(conv.id);
    setCurrentView('chat');
  };

  // Handler to start a new chat
  const handleNewChat = async () => {
    const newId = await createConversation();
    if (newId) {
      setCurrentConversationId(newId);
      setCurrentView('chat');
    }
  };

  // Format timestamp for history items
  const formatTimestamp = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (days === 0) return `Today at ${timeStr}`;
    if (days === 1) return `Yesterday at ${timeStr}`;
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` at ${timeStr}`;
  };


  // Track which messages have been spoken to avoid duplicates
  const spokenMessagesRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Speak text via ElevenLabs TTS API
  const speakText = async (text: string) => {
    if (!text.trim()) return;

    try {
      setIsSpeaking(true);
      console.log('🔊 Speaking:', text);

      const response = await fetch('/api/elevenlabs/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error(`TTS failed: ${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      // Play the new audio
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        console.error('Audio playback error');
      };

      await audio.play();
    } catch (error) {
      console.error('TTS error:', error);
      setIsSpeaking(false);
    }
  };

  // Track AI SDK responses for voice mode and speak them
  useEffect(() => {
    if (inputMode !== 'voice' || messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'assistant') return;

    // Skip if we've already spoken this message
    if (spokenMessagesRef.current.has(lastMessage.id)) return;

    // Extract text content from message parts
    const textParts = lastMessage.parts?.filter(p => p.type === 'text') || [];
    const textContent = textParts.map(p => (p as { type: 'text'; text: string }).text).join(' ');

    if (textContent && status !== 'streaming') {
      // Mark as spoken and speak the text
      spokenMessagesRef.current.add(lastMessage.id);
      speakText(textContent);
    }
  }, [messages, inputMode, status]);

  // Handle form submission
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage({ text: input });
      setInput('');
    }
  };

  // Styles for the widget button
  const widgetStyles = {
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
      maxWidth: 'calc(100vw - 32px)',
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
      whiteSpace: 'nowrap' as const,
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
      whiteSpace: 'nowrap' as const,
    },
  };

  if (!isOpen) {
    return (
      <div style={widgetStyles.widgetButton} onClick={handleOpen} data-testid="assistant-widget">
        <div style={widgetStyles.widgetOrb}>
          <div style={widgetStyles.widgetOrbHighlight} />
          <div style={widgetStyles.widgetOrbReflection} />
        </div>
        <span style={widgetStyles.widgetText}>Need help?</span>
        <button
          style={widgetStyles.widgetCallBtn}
          onClick={(e) => { e.stopPropagation(); handleOpen(); }}
          data-testid="assistant-open"
        >
          <Phone size={14} />
          Ask anything
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '420px',
        height: '650px',
        maxHeight: '90vh',
        backgroundColor: colors.bgCard,
        borderRadius: '16px',
        border: `1px solid ${colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.8)',
        zIndex: 9999,
      }}
    >
      {/* Minimize handle - tap to close */}
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
      <div
        style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.bgSecondary,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {currentView === 'chat' && (
            <button
              onClick={() => setCurrentView('history')}
              style={{
                padding: '6px',
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                color: colors.textSecondary,
                display: 'flex',
                alignItems: 'center',
              }}
              title="Chat history"
            >
              <History size={18} />
            </button>
          )}
          <span style={{ color: colors.textPrimary, fontSize: '14px', fontWeight: 600 }}>
            {currentView === 'history' ? 'Chat History' : 'AI Assistant'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {currentView === 'chat' && (
            <button
              onClick={toggleMode}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                fontSize: '13px',
                fontWeight: 500,
                color: colors.textSecondary,
                backgroundColor: colors.bgHover,
                border: `1px solid ${colors.border}`,
                borderRadius: '20px',
                cursor: 'pointer',
              }}
              data-testid="assistant-toggle-mode"
            >
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
          <button
            onClick={handleClose}
            style={{
              padding: '8px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              color: colors.textSecondary,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Voice Status Bar - only shown in voice mode when chat view is active */}
      {currentView === 'chat' && inputMode === 'voice' && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: colors.bgPrimary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Animated green orb */}
            <div
              style={{
                position: 'relative',
                width: '40px',
                height: '40px',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: `radial-gradient(circle at 30% 30%, #00ff08, ${colors.accent}, #006604)`,
                  boxShadow: isSpeaking || elevenLabs.status === 'connected'
                    ? '0 0 20px rgba(0, 200, 6, 0.6), 0 0 40px rgba(0, 200, 6, 0.3)'
                    : '0 0 10px rgba(0, 200, 6, 0.3)',
                  animation: isSpeaking ? 'pulse 1.5s ease-in-out infinite' : 'none',
                }}
              />
              {/* Highlight */}
              <div
                style={{
                  position: 'absolute',
                  top: '8px',
                  left: '10px',
                  width: '12px',
                  height: '8px',
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.4)',
                  filter: 'blur(2px)',
                }}
              />
            </div>
            {/* Status text */}
            <div>
              <div style={{ color: colors.textPrimary, fontSize: '14px', fontWeight: 500 }}>
                {isSpeaking
                  ? 'Speaking...'
                  : isLoading
                    ? 'Thinking...'
                    : elevenLabs.status === 'connected'
                      ? 'Listening...'
                      : elevenLabs.status === 'connecting'
                        ? 'Connecting...'
                        : 'Ready'}
              </div>
              <div style={{ color: colors.textMuted, fontSize: '12px' }}>
                Say something to talk
              </div>
            </div>
          </div>
          {/* End button */}
          <button
            onClick={handleClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#ffffff',
              backgroundColor: '#ff6b4a',
              border: 'none',
              borderRadius: '24px',
              cursor: 'pointer',
            }}
          >
            <Phone size={16} />
            End
          </button>
        </div>
      )}

      {/* History View */}
      {currentView === 'history' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: colors.bgPrimary }}>
          {/* History Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px',
            borderBottom: `1px solid ${colors.border}`,
          }}>
            <span style={{ color: colors.textPrimary, fontSize: '16px', fontWeight: 600 }}>
              Conversations
            </span>
            <button
              onClick={handleNewChat}
              style={{
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
              }}
            >
              <Plus size={14} />
              New Chat
            </button>
          </div>

          {/* Conversations List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {conversations.length === 0 ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                color: colors.textMuted,
                fontSize: '14px',
                padding: '32px',
                textAlign: 'center',
                height: '100%',
              }}>
                <MessageSquare size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                <p>No conversations yet</p>
                <p style={{ fontSize: '12px' }}>Start a new chat to begin</p>
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    marginBottom: '4px',
                    backgroundColor: conv.id === currentConversationId ? colors.bgHover : 'transparent',
                    border: 'none',
                    width: '100%',
                    textAlign: 'left',
                  }}
                >
                  <span style={{
                    color: colors.textPrimary,
                    fontSize: '14px',
                    fontWeight: 500,
                    marginBottom: '4px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {conv.title}
                  </span>
                  <span style={{ color: colors.textMuted, fontSize: '12px' }}>
                    {formatTimestamp(conv.updated_at)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Chat View */
        <>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {messages.length === 0 && (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
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
            <div style={{
              backgroundColor: colors.assistantBubble,
              borderRadius: '16px',
              borderTopLeftRadius: '4px',
              padding: '12px 16px',
              maxWidth: '300px',
            }}>
              <p style={{ fontSize: '14px', lineHeight: 1.5, margin: 0, color: colors.textPrimary }}>
                Hi, I&apos;m here to answer your questions about your portfolio. What would you like to know?
              </p>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: message.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            {/* Message bubble */}
            <div
              style={{
                maxWidth: '85%',
                padding: '12px 16px',
                borderRadius: '16px',
                backgroundColor:
                  message.role === 'user' ? colors.userBubble : colors.assistantBubble,
                color: colors.textPrimary,
              }}
            >
              {/* Render message parts (text and tools) */}
              {message.parts?.map((part, index) => {
                // Handle text parts
                if (part.type === 'text') {
                  return <span key={index}>{part.text}</span>;
                }

                // Handle tool parts - type is 'tool-<toolName>'
                // Check if this is a tool invocation part
                if (part.type.startsWith('tool-')) {
                  // Type assertion: After confirming it's a tool part, cast to access state/output/approval
                  const toolPart = part as typeof part & {
                    state?: 'input-streaming' | 'input-available' | 'output-available' | 'output-error' | 'approval-requested';
                    output?: unknown;
                    errorText?: string;
                    input?: Record<string, unknown>;
                    approval?: { id: string };
                    toolCallId?: string;
                  };
                  const toolName = part.type.replace('tool-', '');

                  // Handle approval-requested state for trade tools
                  if (toolPart.state === 'approval-requested' && toolPart.approval && toolPart.input) {
                    // Trade execution approval
                    if (toolName === 'executeTrade') {
                      const input = toolPart.input as {
                        symbol: string;
                        quantity: number;
                        side: 'buy' | 'sell';
                        orderType: 'market' | 'limit';
                        limitPrice?: number;
                        securityType?: 'stock' | 'option';
                        optionDetails?: { strike: number; expiration: string; callPut: 'call' | 'put' };
                      };
                      return (
                        <TradeApproval
                          key={index}
                          symbol={input.symbol}
                          quantity={input.quantity}
                          side={input.side}
                          orderType={input.orderType}
                          limitPrice={input.limitPrice}
                          securityType={input.securityType}
                          optionDetails={input.optionDetails}
                          onApprove={() => {
                            addToolApprovalResponse({
                              id: toolPart.approval!.id,
                              approved: true,
                            });
                          }}
                          onDeny={() => {
                            addToolApprovalResponse({
                              id: toolPart.approval!.id,
                              approved: false,
                            });
                          }}
                        />
                      );
                    }

                    // Order cancellation approval
                    if (toolName === 'cancelOrder') {
                      const input = toolPart.input as { orderId: string };
                      return (
                        <div
                          key={index}
                          style={{
                            backgroundColor: colors.bgCard,
                            borderRadius: '12px',
                            border: `1px solid ${colors.border}`,
                            padding: '16px',
                            marginTop: '12px',
                          }}
                        >
                          <div style={{ color: colors.textPrimary, marginBottom: '12px' }}>
                            Cancel order <strong>{input.orderId}</strong>?
                          </div>
                          <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                              onClick={() => addToolApprovalResponse({ id: toolPart.approval!.id, approved: false })}
                              style={{
                                flex: 1,
                                padding: '10px',
                                backgroundColor: colors.bgSecondary,
                                border: `1px solid ${colors.border}`,
                                borderRadius: '8px',
                                color: colors.textSecondary,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Keep Order
                            </button>
                            <button
                              onClick={() => addToolApprovalResponse({ id: toolPart.approval!.id, approved: true })}
                              style={{
                                flex: 1,
                                padding: '10px',
                                backgroundColor: '#ff4466',
                                border: 'none',
                                borderRadius: '8px',
                                color: '#fff',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Cancel Order
                            </button>
                          </div>
                        </div>
                      );
                    }
                  }

                  // Show loading state while tool is executing
                  if (toolPart.state === 'input-available' || toolPart.state === 'input-streaming') {
                    return (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          color: colors.textMuted,
                          fontSize: '13px',
                          marginTop: '8px',
                        }}
                      >
                        <Loader2 size={14} className="animate-spin" />
                        <span>Fetching data...</span>
                      </div>
                    );
                  }

                  // Render the tool output as a UI card
                  if (toolPart.state === 'output-available' && toolPart.output) {
                    return (
                      <ToolOutputCard
                        key={index}
                        toolName={toolName}
                        output={toolPart.output}
                      />
                    );
                  }

                  // Handle errors
                  if (toolPart.state === 'output-error') {
                    return (
                      <div
                        key={index}
                        style={{
                          color: '#ff4466',
                          fontSize: '13px',
                          marginTop: '8px',
                        }}
                      >
                        Error: {toolPart.errorText || 'Failed to fetch data'}
                      </div>
                    );
                  }
                }

                return null;
              })}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: colors.textMuted,
              padding: '8px 0',
            }}
          >
            <Loader2 size={16} className="animate-spin" />
            <span>Thinking...</span>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div
            style={{
              padding: '12px',
              backgroundColor: 'rgba(255, 68, 102, 0.1)',
              borderRadius: '8px',
              color: '#ff4466',
              fontSize: '13px',
            }}
          >
            Error: {error.message}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={onSubmit}
        style={{
          padding: '16px',
          borderTop: `1px solid ${colors.border}`,
          backgroundColor: colors.bgSecondary,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: '24px',
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.bgCard,
              color: colors.textPrimary,
              fontSize: '14px',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              backgroundColor: input.trim() && !isLoading ? colors.accent : colors.bgCard,
              border: 'none',
              cursor: input.trim() && !isLoading ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: input.trim() && !isLoading ? 1 : 0.5,
            }}
          >
            <Send color="white" size={18} />
          </button>
        </div>
      </form>
        </>
      )}
    </div>
  );
};

export default AIChatAssistant;
