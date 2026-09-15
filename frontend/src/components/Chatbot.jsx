import React, { useState, useRef, useEffect } from 'react';
import { Send, AlertCircle, Loader, RotateCcw, Trash2, Sparkles } from 'lucide-react';

export default function Chatbot() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSlowResponse, setIsSlowResponse] = useState(false);
  const [error, setError] = useState(null);
  const [lastFailedMessage, setLastFailedMessage] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Default to v1 endpoint, or use env variable
  const CRIT_API_URL = import.meta.env.VITE_CRIT_API_URL || 'http://localhost:3001/api/v1/chat';

  // Compute clear-session URL from chat URL
  const getClearSessionUrl = (chatUrl) => {
    if (chatUrl.includes('/chat')) {
      return chatUrl.replace(/\/chat$/, '/clear-session');
    }
    return chatUrl.replace(/\/api(\/v1)?.*$/, '/api$1/clear-session');
  };

  // Generate a persistent sessionId for the duration of this browser session
  const [sessionId] = useState(() => {
    const savedSession = sessionStorage.getItem('crit_session_id');
    if (savedSession) return savedSession;
    const newSession = `session_${Math.random().toString(36).substring(2, 11)}`;
    sessionStorage.setItem('crit_session_id', newSession);
    return newSession;
  });

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Timer to notify user if server is experiencing cold start (Render free tier)
  useEffect(() => {
    let timer;
    if (loading) {
      timer = setTimeout(() => {
        setIsSlowResponse(true);
      }, 4000);
    } else {
      setIsSlowResponse(false);
    }
    return () => clearTimeout(timer);
  }, [loading]);

  const sendMessage = async (messageText) => {
    if (!messageText || !messageText.trim() || loading) return;

    const trimmedText = messageText.trim();
    setError(null);
    setLastFailedMessage(null);

    // Add user message to chat state
    const userMessageObj = { id: Date.now(), text: trimmedText, sender: 'user' };
    setMessages((prev) => [...prev, userMessageObj]);
    setLoading(true);

    try {
      const response = await fetch(CRIT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmedText, sessionId }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorDetail = data?.error || `Server returned status ${response.status}`;
        throw new Error(errorDetail);
      }

      const assistantMessage = {
        id: Date.now() + 1,
        text: data?.response || 'No response received from assistant.',
        sender: 'assistant',
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error('Chat request failed:', err);
      setError(err.message || 'Failed to connect to CRIT server. Please check your network or server URL.');
      setLastFailedMessage(trimmedText);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    const textToSend = input;
    setInput('');
    sendMessage(textToSend);
  };

  const handleRetry = () => {
    if (!lastFailedMessage) return;
    const messageToRetry = lastFailedMessage;
    // Remove the last user message from list since sendMessage will re-add it
    setMessages((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].sender === 'user') {
        return prev.slice(0, -1);
      }
      return prev;
    });
    sendMessage(messageToRetry);
  };

  const clearChat = async () => {
    try {
      const clearUrl = getClearSessionUrl(CRIT_API_URL);
      await fetch(clearUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
    } catch (err) {
      console.error('Failed to clear session on backend:', err);
    }
    setMessages([]);
    setError(null);
    setLastFailedMessage(null);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 antialiased selection:bg-amber-500 selection:text-white">
      {/* Header */}
      <header className="border-b border-slate-700/80 bg-slate-800/90 backdrop-blur-md px-4 sm:px-6 py-3.5 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">CRIT</h1>
              <p className="text-xs text-slate-400">Criteria AI Assistant • Powered by Groq</p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700/80 hover:bg-slate-700 text-slate-200 hover:text-white transition disabled:opacity-50 border border-slate-600/50"
              title="Clear current conversation"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </header>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="max-w-4xl mx-auto space-y-5">
          {messages.length === 0 && !error && (
            <div className="h-full flex flex-col items-center justify-center text-center py-16 sm:py-24">
              <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700/80 flex items-center justify-center mb-4 shadow-inner">
                <span className="text-3xl font-bold text-amber-400 select-none">⚡</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-100 mb-2">How can CRIT help today?</h2>
              <p className="text-slate-400 text-sm max-w-sm leading-relaxed">
                Ask anything about web development, design systems, and creative projects.
              </p>
            </div>
          )}

          {/* Chat Messages */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xl sm:max-w-2xl px-4 py-3 rounded-2xl shadow-sm ${
                  msg.sender === 'user'
                    ? 'bg-amber-600 text-white rounded-br-xs'
                    : 'bg-slate-800 text-slate-100 rounded-bl-xs border border-slate-700/70'
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {msg.text}
                </p>
              </div>
            </div>
          ))}

          {/* Loading Indicator with Cold-Start notification */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-800 border border-slate-700/70 px-4 py-3 rounded-2xl rounded-bl-xs shadow-sm">
                <div className="flex items-center gap-2.5">
                  <Loader className="w-4 h-4 animate-spin text-amber-400" />
                  <span className="text-sm text-slate-300 font-medium">
                    {isSlowResponse ? 'Waking up server & generating response...' : 'Thinking...'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Error Banner with Retry Action */}
          {error && (
            <div className="flex justify-center">
              <div className="w-full max-w-2xl bg-red-950/80 border border-red-800/80 text-red-200 px-4 py-3.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs sm:text-sm leading-relaxed">{error}</p>
                </div>
                {lastFailedMessage && (
                  <button
                    onClick={handleRetry}
                    disabled={loading}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-red-800 hover:bg-red-700 text-white transition self-end sm:self-auto flex-shrink-0 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Retry</span>
                  </button>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <footer className="border-t border-slate-700/80 bg-slate-800/95 backdrop-blur-md px-4 sm:px-6 py-4">
        <form onSubmit={handleFormSubmit} className="max-w-4xl mx-auto">
          <div className="flex gap-2 sm:gap-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              disabled={loading}
              autoComplete="off"
              autoCapitalize="sentences"
              className="flex-1 bg-slate-700/80 border border-slate-600/80 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:opacity-50 transition"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-amber-600 hover:bg-amber-500 active:bg-amber-700 disabled:bg-slate-700 disabled:text-slate-500 text-white px-4 sm:px-5 py-3 rounded-xl transition font-medium flex items-center gap-2 shadow-sm cursor-pointer disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline text-sm">Send</span>
            </button>
          </div>
        </form>
      </footer>
    </div>
  );
}
