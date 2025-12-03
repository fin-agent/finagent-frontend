import type { Position } from '../types';
import alpacaApi from './alpacaApi';

// ElevenLabs Agent Configuration
const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || 'agent_7801k6206wxsfqh8jxhasqtd0hr9';
const API_KEY = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY || 'sk_a30c60fa0accbee9da7e496657a184279ee38e9c3c7d534b';
const ELEVENLABS_WS_URL = 'wss://api.elevenlabs.io/v1/convai/conversation';

interface ConversationConfig {
  agent_id: string;
  requires_auth: boolean;
  audio_input_mode?: 'buffered' | 'streaming';
  audio_output_mode?: 'buffered' | 'streaming';
  optimize_streaming_latency?: number;
}

interface ConversationEvent {
  type: string;
  conversation_id?: string;
  audio?: string; // base64 encoded audio
  text?: string;
  role?: 'user' | 'agent';
  mode?: string;
  settings?: Record<string, unknown>;
  error?: string;
  status?: string;
  function_name?: string;
  function_arguments?: Record<string, unknown>;
  function_call_id?: string;
}

class ElevenLabsAgentService {
  private ws: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private audioQueue: string[] = [];
  private isProcessingAudio = false;
  private conversationId: string | null = null;
  private audioStream: MediaStream | null = null;
  
  // Callbacks
  private onTranscriptUpdate: ((text: string, role: 'user' | 'agent') => void) | null = null;
  private onStatusChange: ((status: string) => void) | null = null;
  private onError: ((error: string) => void) | null = null;

  constructor() {
    // Initialize AudioContext
    if (typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioContext = new AudioContextClass();
      }
    }
  }

  // Set callback handlers
  setCallbacks(callbacks: {
    onTranscriptUpdate?: (text: string, role: 'user' | 'agent') => void;
    onStatusChange?: (status: string) => void;
    onError?: (error: string) => void;
  }) {
    this.onTranscriptUpdate = callbacks.onTranscriptUpdate || null;
    this.onStatusChange = callbacks.onStatusChange || null;
    this.onError = callbacks.onError || null;
  }

  // Initialize connection to ElevenLabs agent
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create WebSocket connection
        this.ws = new WebSocket(ELEVENLABS_WS_URL);
        
        this.ws.onopen = () => {
          console.log('Connected to ElevenLabs agent');
          this.onStatusChange?.('Connected');
          
          // Send initialization message
          const config: ConversationConfig = {
            agent_id: AGENT_ID,
            requires_auth: true,
            audio_input_mode: 'streaming',
            audio_output_mode: 'streaming',
            optimize_streaming_latency: 3
          };
          
          this.sendMessage({
            type: 'conversation_initiation',
            conversation_config: config,
            custom_llm_extra_body: {
              functions: this.getAgentFunctions()
            }
          });
          
          resolve();
        };

        this.ws.onmessage = async (event) => {
          const data = JSON.parse(event.data) as ConversationEvent;
          await this.handleMessage(data);
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.onError?.('Connection error occurred');
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('Disconnected from ElevenLabs agent');
          this.onStatusChange?.('Disconnected');
          this.cleanup();
        };

      } catch (error) {
        console.error('Failed to connect:', error);
        reject(error);
      }
    });
  }

  // Handle incoming messages from the agent
  private async handleMessage(data: ConversationEvent) {
    switch (data.type) {
      case 'conversation_initiation_response':
        this.conversationId = data.conversation_id || null;
        console.log('Conversation initialized:', this.conversationId);
        
        // Send authentication
        this.sendMessage({
          type: 'user_authorization',
          authorization: `Bearer ${API_KEY}`
        });
        break;

      case 'authorization_response':
        if (data.status === 'authorized') {
          console.log('Authorized successfully');
          this.onStatusChange?.('Ready');
        } else {
          this.onError?.('Authorization failed');
        }
        break;

      case 'audio':
        // Queue audio for playback
        if (data.audio) {
          this.audioQueue.push(data.audio);
          if (!this.isProcessingAudio) {
            this.processAudioQueue();
          }
        }
        break;

      case 'transcript':
        // Update conversation transcript
        if (data.text && data.role) {
          this.onTranscriptUpdate?.(data.text, data.role);
        }
        break;

      case 'interruption':
        // Handle interruption
        this.audioQueue = [];
        this.isProcessingAudio = false;
        break;

      case 'function_call':
        // Handle function calls from the agent
        await this.handleFunctionCall(data);
        break;

      case 'error':
        console.error('Agent error:', data.error);
        this.onError?.(data.error || 'Unknown error occurred');
        break;

      case 'ping':
        // Respond to ping
        this.sendMessage({ type: 'pong' });
        break;
    }
  }

  // Handle function calls from the agent
  private async handleFunctionCall(data: ConversationEvent) {
    const functionName = data.function_name;
    const args = data.function_arguments || {};

    let result: unknown = {};

    try {
      switch (functionName) {
        case 'get_portfolio':
          result = await alpacaApi.getPortfolio();
          break;

        case 'get_positions':
          result = await alpacaApi.getPositions();
          break;

        case 'get_stock_price':
          if (args.symbols && Array.isArray(args.symbols)) {
            result = await alpacaApi.getStocks(args.symbols);
          }
          break;

        case 'get_position_info':
          if (args.symbol) {
            const positions = await alpacaApi.getPositions();
            result = positions.find((p: Position) => p.symbol === args.symbol);
          }
          break;

        default:
          result = { error: `Unknown function: ${functionName}` };
      }

      // Send function result back to agent
      this.sendMessage({
        type: 'function_call_response',
        function_call_id: data.function_call_id,
        result: JSON.stringify(result)
      });

    } catch (error) {
      console.error('Function call error:', error);
      this.sendMessage({
        type: 'function_call_response',
        function_call_id: data.function_call_id,
        result: JSON.stringify({ error: String(error) })
      });
    }
  }

  // Define available functions for the agent
  private getAgentFunctions() {
    return [
      {
        name: 'get_portfolio',
        description: 'Get the current portfolio value and summary',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'get_positions',
        description: 'Get all current positions in the portfolio',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'get_stock_price',
        description: 'Get the current price for one or more stocks',
        parameters: {
          type: 'object',
          properties: {
            symbols: {
              type: 'array',
              items: { type: 'string' },
              description: 'Stock symbols to get prices for'
            }
          },
          required: ['symbols']
        }
      },
      {
        name: 'get_position_info',
        description: 'Get detailed information about a specific position',
        parameters: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Stock symbol to get position info for'
            }
          },
          required: ['symbol']
        }
      }
    ];
  }

  // Start streaming audio from microphone
  async startListening(): Promise<void> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Microphone access not supported');
    }

    try {
      // Get microphone access
      this.audioStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        } 
      });

      // Create media recorder for streaming
      this.mediaRecorder = new MediaRecorder(this.audioStream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      // Stream audio chunks to the agent
      this.mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && this.ws?.readyState === WebSocket.OPEN) {
          // Convert blob to base64
          const buffer = await event.data.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
          
          this.sendMessage({
            type: 'audio',
            audio: base64
          });
        }
      };

      // Start recording with 100ms chunks
      this.mediaRecorder.start(100);
      this.onStatusChange?.('Listening');

    } catch (error) {
      console.error('Error accessing microphone:', error);
      this.onError?.('Failed to access microphone');
      throw error;
    }
  }

  // Stop listening
  stopListening() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.onStatusChange?.('Processing');
    }

    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }

    // Send end of input signal
    this.sendMessage({ type: 'audio_end' });
  }

  // Process queued audio from agent
  private async processAudioQueue() {
    if (this.audioQueue.length === 0 || !this.audioContext) {
      this.isProcessingAudio = false;
      return;
    }

    this.isProcessingAudio = true;
    const base64Audio = this.audioQueue.shift()!;

    try {
      // Decode base64 to audio buffer
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Create audio buffer and play
      const audioBuffer = await this.audioContext.decodeAudioData(bytes.buffer);
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      
      source.onended = () => {
        // Process next audio in queue
        this.processAudioQueue();
      };
      
      source.start(0);

    } catch (error) {
      console.error('Error playing audio:', error);
      this.isProcessingAudio = false;
      this.processAudioQueue(); // Try next audio
    }
  }

  // Send message to agent
  private sendMessage(message: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  // Interrupt the agent
  interrupt() {
    this.sendMessage({ type: 'interruption' });
    this.audioQueue = [];
    this.isProcessingAudio = false;
  }

  // Clean up resources
  private cleanup() {
    this.stopListening();
    this.audioQueue = [];
    this.isProcessingAudio = false;
    this.conversationId = null;
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
  }

  // Disconnect from agent
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.cleanup();
  }

  // Check if connected
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export default new ElevenLabsAgentService();
