'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useConversation } from '@elevenlabs/react';
import { Mic, MessageSquare, X, Phone, Send, Loader2, Plus, History } from 'lucide-react';

type InputMode = 'voice' | 'text';
type View = 'chat' | 'history';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface TranscriptMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
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

  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || 'agent_9401k7psm5p0en5a8d80yk22f2zz';

  // Track if we've set a title for current voice conversation
  const voiceTitleSetRef = useRef(false);
  // Track if we're resuming from history (don't clear transcript)
  const isResumingFromHistoryRef = useRef(false);

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
    onMessage: (message) => {
      if (message.message) {
        const role = message.source === 'user' ? 'user' : 'assistant';
        const newMessage: TranscriptMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          role,
          content: message.message,
          timestamp: new Date(),
        };
        setTranscript(prev => [...prev, newMessage]);
        setIsSending(false); // Clear sending state when we get a response

        // Save to database if we have a conversation
        if (currentConversationId && role === 'assistant') {
          saveMessage(currentConversationId, 'assistant', message.message, inputMode);
        }
        if (currentConversationId && role === 'user') {
          saveMessage(currentConversationId, 'user', message.message, inputMode);
          // Auto-generate title from first user message
          if (!voiceTitleSetRef.current) {
            const currentConv = conversations.find((c) => c.id === currentConversationId);
            if (currentConv?.title === 'New Chat') {
              updateConversationTitle(currentConversationId, message.message.slice(0, 50));
              voiceTitleSetRef.current = true;
            }
          }
        }
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
        // Load messages into unified transcript
        const loadedMessages: TranscriptMessage[] = data.messages.map((msg: { id: string; role: string; content: string; created_at: string }) => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          timestamp: new Date(msg.created_at),
        }));
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
    setCurrentView('chat');
    if (!currentConversationId) {
      const newId = await createConversation();
      if (newId) setCurrentConversationId(newId);
    }
  }, [currentConversationId]);

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
      width: '400px',
      height: '600px',
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
      maxWidth: '280px',
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
    // Voice mode
    voiceContainer: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      backgroundColor: colors.bgPrimary,
    },
    voiceOrb: {
      position: 'relative' as const,
      width: '180px',
      height: '180px',
      marginBottom: '32px',
    },
    orbOuter: {
      position: 'absolute' as const,
      inset: 0,
      borderRadius: '50%',
      background: `radial-gradient(circle at 30% 30%, #00ff08, ${colors.accent}, #006604)`,
    },
    orbInner: {
      position: 'absolute' as const,
      top: '10px',
      left: '10px',
      width: '20px',
      height: '20px',
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.3)',
    },
    callButton: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '12px 24px',
      fontSize: '14px',
      fontWeight: 500,
      color: colors.textPrimary,
      backgroundColor: colors.bgHover,
      border: `1px solid ${colors.border}`,
      borderRadius: '24px',
      cursor: 'pointer',
    },
    endCallButton: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '12px 24px',
      fontSize: '14px',
      fontWeight: 500,
      color: colors.textPrimary,
      backgroundColor: '#ff5000',
      border: 'none',
      borderRadius: '24px',
      cursor: 'pointer',
    },
    statusText: {
      color: colors.textSecondary,
      fontSize: '14px',
      marginBottom: '16px',
    },
    showConversationLink: {
      marginTop: '32px',
      fontSize: '14px',
      color: colors.textMuted,
      textDecoration: 'underline',
      background: 'none',
      border: 'none',
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
          {/* Chat Messages */}
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
              <div
                key={message.id}
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
                  <div
                    key={msg.id}
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

export default UnifiedAssistant;
