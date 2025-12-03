import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Mic, Volume2, Phone, X, Wifi, WifiOff, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useConversation } from '@elevenlabs/react';

const VoiceAssistantNew: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationContainerRef = useRef<HTMLDivElement>(null);
  const [conversationHistory, setConversationHistory] = useState<Array<{
    type: 'user' | 'assistant';
    text: string;
    timestamp: Date;
  }>>([]);
  
  const conversation = useConversation({
    onConnect: () => {
      console.log('Connected to ElevenLabs agent');
      setConversationHistory(prev => [...prev, {
        type: 'assistant',
        text: 'Connected! I can now help you with your portfolio, stock prices, and positions.',
        timestamp: new Date()
      }]);
    },
    onDisconnect: () => {
      console.log('Disconnected from ElevenLabs agent');
      setConversationHistory(prev => [...prev, {
        type: 'assistant',
        text: 'Disconnected. Click the microphone to reconnect.',
        timestamp: new Date()
      }]);
    },
    onMessage: (message) => {
      console.log('Message:', message);
      // Handle messages from the conversation
      if (message.message && message.source) {
        setConversationHistory(prev => [...prev, {
          type: message.source === 'user' ? 'user' : 'assistant',
          text: message.message,
          timestamp: new Date()
        }]);
      }
    },
    onError: (error) => {
      console.error('Conversation error:', error);
      setError('Connection error occurred. Please try again.');
      setTimeout(() => setError(null), 5000);
    },
  });

  useEffect(() => {
    // Add welcome message
    setConversationHistory([{
      type: 'assistant',
      text: 'Hello! I\'m your AI-powered financial assistant. I can help you with your portfolio, stock prices, and positions.',
      timestamp: new Date()
    }]);
    
    // Cleanup on unmount
    return () => {
      if (conversation.status === 'connected') {
        conversation.endSession();
      }
    };
  }, []);

  // Auto-scroll to bottom when conversation history changes
  useEffect(() => {
    if (conversationContainerRef.current && !isMinimized) {
      const container = conversationContainerRef.current;
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
      }, 100);
    }
  }, [conversationHistory, isMinimized]);

  // Scroll to bottom when widget is opened or expanded
  useEffect(() => {
    if (isOpen && isExpanded && !isMinimized && conversationContainerRef.current) {
      const container = conversationContainerRef.current;
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
      }, 100);
    }
  }, [isOpen, isExpanded, isMinimized]);

  const startConversation = useCallback(async () => {
    try {
      setError(null);
      
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Start the conversation with the agent
      await conversation.startSession({
        agentId: process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || 'agent_7801k6206wxsfqh8jxhasqtd0hr9',
        connectionType: 'webrtc' as const,
      });
      
    } catch (error) {
      console.error('Failed to start conversation:', error);
      setError('Failed to connect. Please check your microphone permissions.');
    }
  }, [conversation]);

  const stopConversation = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const toggleAssistant = useCallback(() => {
    if (!isExpanded) {
      setIsExpanded(true);
      setIsOpen(true);
      // Auto-connect when opening
      if (conversation.status === 'disconnected') {
        startConversation();
      }
    } else {
      setIsOpen(!isOpen);
      // Auto-connect when reopening if not connected
      if (isOpen === false && conversation.status === 'disconnected') {
        startConversation();
      }
    }
  }, [isExpanded, isOpen, conversation.status, startConversation]);

  const closeAll = useCallback(() => {
    setIsOpen(false);
    setIsExpanded(false);
    setIsMinimized(false);
    if (conversation.status === 'connected') {
      stopConversation();
    }
  }, [conversation.status, stopConversation]);

  // Helper to get status text
  const getStatusText = () => {
    switch (conversation.status) {
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        if (conversation.isSpeaking) {
          return 'Speaking...';
        }
        return 'Listening...';
      case 'disconnected':
        return 'Disconnected';
      default:
        return 'Ready';
    }
  };

  return (
    <>
      {/* Floating Voice Button */}
      {!isExpanded ? (
        <motion.div
          className="voice-widget"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          onClick={toggleAssistant}
        >
          <div className="voice-widget-icon">
            <div className="voice-widget-icon-inner"></div>
          </div>
          <span className="voice-widget-text">Need help?</span>
          <div className="voice-widget-button">
            <Phone size={18} />
            <span>Ask anything</span>
          </div>
        </motion.div>
      ) : null}

      {/* Voice Assistant Panel */}
      <AnimatePresence>
        {isOpen && isExpanded && (
          <motion.div
            className="voice-assistant"
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: 'spring', damping: 20 }}
          >
            <div className="voice-header">
              <div className="connection-status">
                {conversation.status === 'connected' ? (
                  <Wifi size={16} className="status-icon connected" />
                ) : (
                  <WifiOff size={16} className="status-icon disconnected" />
                )}
                <span className="voice-status">
                  {getStatusText()}
                </span>
              </div>
              <div className="voice-header-actions">
                <button 
                  className="voice-minimize" 
                  onClick={() => setIsMinimized(!isMinimized)}
                  title={isMinimized ? 'Expand' : 'Minimize'}
                >
                  {isMinimized ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                <button className="voice-close" onClick={closeAll} title="Close">
                  <X size={18} />
                </button>
              </div>
            </div>

            {!isMinimized && (
              <>
            <div className="conversation-container" ref={conversationContainerRef}>
              {conversationHistory.map((entry, index) => (
                <div key={index} className={`message ${entry.type}`}>
                  <div className="message-content">
                    {entry.type === 'user' ? (
                      <Mic size={16} className="message-icon" />
                    ) : (
                      <Volume2 size={16} className="message-icon" />
                    )}
                    <p>{entry.text}</p>
                  </div>
                  <span className="message-time">
                    {entry.timestamp.toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </span>
                </div>
              ))}
            </div>

            <div className="voice-controls">
              {conversation.status === 'connecting' ? (
                <div className="connecting-status">
                  <div className="spinner"></div>
                  <span>Connecting to AI assistant...</span>
                </div>
              ) : conversation.status === 'connected' ? (
                <>
                  <div className="voice-status-info">
                    <span>{conversation.isSpeaking ? 'Agent is speaking' : 'Agent is listening'}</span>
                  </div>
                  {!conversation.isSpeaking && (
                    <motion.div
                      className="voice-wave"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <span className="wave"></span>
                      <span className="wave"></span>
                      <span className="wave"></span>
                    </motion.div>
                  )}
                </>
              ) : (
                <div className="connecting-status">
                  <div className="spinner"></div>
                  <span>Reconnecting...</span>
                </div>
              )}
            </div>

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <div className="voice-hints">
              <p>Natural conversation examples:</p>
              <ul>
                <li>"Tell me about my portfolio"</li>
                <li>"What's the current price of Apple?"</li>
                <li>"Which stocks are performing best today?"</li>
                <li>"How many shares of Tesla do I own?"</li>
                <li>"Give me a summary of my investments"</li>
              </ul>
            </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default VoiceAssistantNew;
