/**
 * ElevenLabs Conversational AI Chat Widget
 * 
 * Uses @elevenlabs/react SDK for secure, scalable voice/text conversations.
 * 
 * INSTALLATION (in client's project):
 * npm install @elevenlabs/react lucide-react
 * 
 * USAGE:
 * <ChatWidget agentId="your-agent-id" />
 * 
 * The agentId comes from the client's ElevenLabs Dashboard.
 * All conversation data flows directly between client browser and ElevenLabs.
 * No data passes through your platform (except Server Tool webhooks).
 */
'use client';

import { useState, useCallback } from 'react';
import { useConversation } from '@elevenlabs/react';
import { MessageCircle, X, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

interface ChatWidgetProps {
  // Required: ElevenLabs Agent ID from client's dashboard
  agentId: string;
  
  // UI Customization
  position?: 'bottom-right' | 'bottom-left';
  primaryColor?: string;
  title?: string;
  subtitle?: string;
  poweredByText?: string;
  poweredByLink?: string;
}

export default function ChatWidget({
  agentId,
  position = 'bottom-right',
  primaryColor = '#6366f1',
  title = 'Voice Assistant',
  subtitle = 'Click the mic to start talking',
  poweredByText = 'Powered by Ruskins AI Consulting',
  poweredByLink = 'https://ruskinsconsulting.com',
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // ElevenLabs Conversation Hook
  const conversation = useConversation({
    onConnect: () => {
      console.log('[ChatWidget] Connected to ElevenLabs');
    },
    onDisconnect: () => {
      console.log('[ChatWidget] Disconnected from ElevenLabs');
    },
    onMessage: (message) => {
      console.log('[ChatWidget] Message:', message);
    },
    onError: (error) => {
      console.error('[ChatWidget] Error:', error);
    },
  });

  const startConversation = useCallback(async () => {
    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Start the conversation session
      await conversation.startSession({
        agentId,
        connectionType: 'websocket',
      });
    } catch (error) {
      console.error('[ChatWidget] Failed to start conversation:', error);
    }
  }, [agentId, conversation]);

  const stopConversation = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const toggleMute = useCallback(() => {
    if (isMuted) {
      conversation.setVolume({ volume: 1 });
    } else {
      conversation.setVolume({ volume: 0 });
    }
    setIsMuted(!isMuted);
  }, [conversation, isMuted]);

  const positionClasses = position === 'bottom-right' 
    ? 'right-4 sm:right-6' 
    : 'left-4 sm:left-6';

  const isConnected = conversation.status === 'connected';
  const isSpeaking = conversation.isSpeaking;

  return (
    <>
      {/* Floating Chat Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={`fixed bottom-4 sm:bottom-6 ${positionClasses} z-50 p-4 rounded-full shadow-lg hover:scale-110 transition-all duration-300`}
          style={{ backgroundColor: primaryColor }}
          aria-label="Open voice assistant"
        >
          <MessageCircle className="w-6 h-6 text-white" />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div 
          className={`fixed bottom-4 sm:bottom-6 ${positionClasses} z-50 w-[calc(100vw-2rem)] sm:w-80 bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200`}
        >
          {/* Header */}
          <div 
            className="p-4 text-white flex items-center justify-between"
            style={{ backgroundColor: primaryColor }}
          >
            <div>
              <h3 className="font-semibold text-lg">{title}</h3>
              <p className="text-sm opacity-90">{subtitle}</p>
            </div>
            <button
              onClick={() => {
                if (isConnected) stopConversation();
                setIsOpen(false);
              }}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Status Display */}
          <div className="p-6 flex flex-col items-center justify-center space-y-4">
            {/* Connection Status */}
            <div className="text-center">
              <div 
                className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-3 transition-all ${
                  isConnected 
                    ? isSpeaking 
                      ? 'animate-pulse' 
                      : '' 
                    : ''
                }`}
                style={{ 
                  backgroundColor: isConnected ? primaryColor : '#e5e7eb',
                }}
              >
                {isConnected ? (
                  <Volume2 className={`w-10 h-10 text-white ${isSpeaking ? 'animate-bounce' : ''}`} />
                ) : (
                  <Mic className="w-10 h-10 text-gray-400" />
                )}
              </div>
              <p className="text-sm text-gray-600">
                {isConnected 
                  ? isSpeaking 
                    ? 'Assistant is speaking...' 
                    : 'Listening...'
                  : 'Click to start conversation'
                }
              </p>
            </div>

            {/* Control Buttons */}
            <div className="flex gap-3">
              {!isConnected ? (
                <button
                  onClick={startConversation}
                  className="px-6 py-3 text-white rounded-full font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Mic className="w-5 h-5" />
                  Start Talking
                </button>
              ) : (
                <>
                  <button
                    onClick={toggleMute}
                    className="p-3 rounded-full border border-gray-300 hover:bg-gray-100 transition-colors"
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? (
                      <VolumeX className="w-5 h-5 text-gray-600" />
                    ) : (
                      <Volume2 className="w-5 h-5 text-gray-600" />
                    )}
                  </button>
                  <button
                    onClick={stopConversation}
                    className="px-6 py-3 bg-red-500 text-white rounded-full font-medium hover:bg-red-600 transition-colors flex items-center gap-2"
                  >
                    <MicOff className="w-5 h-5" />
                    End
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-gray-200 bg-gray-50">
            <a 
              href={poweredByLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-400 text-center block hover:text-gray-600 transition-colors"
            >
              {poweredByText}
            </a>
          </div>
        </div>
      )}
    </>
  );
}
