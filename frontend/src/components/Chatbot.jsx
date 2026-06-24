import React, { useState, useRef, useEffect } from 'react';
import { Send, AlertCircle, Loader } from 'lucide-react';

export default function Chatbot() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const CRIT_API_URL = import.meta.env.VITE_CRIT_API_URL || 'http://localhost:3001/api/chat';

  // Generate a persistent sessionId for the duration of this tab session
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
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input.trim();
    setInput('');
    setError(null);

    // Add user message to chat
    const newUserMessage = { id: Date.now(), text: userMessage, sender: 'user' };
    setMessages((prev) => [...prev, newUserMessage]);

    setLoading(true);

    try {
      const response = await fetch(CRIT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, sessionId }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage = {
        id: Date.now() + 1,
        text: data.response || 'No response received',
        sender: 'assistant',
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(err.message || 'Failed to send message. Check your connection.');
      console.error('Chat error:', err);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const clearChat = async () => {
    try {
      const clearUrl = CRIT_API_URL.replace('/chat', '/clear-session');
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
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">CRIT</h1>
            <p className="text-xs text-slate-400 mt-1">Criteria AI Assistant (Powered by Groq)</p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="px-3 py-1.5 text-xs rounded bg-slate-700 hover:bg-slate-600 transition"
            >
              Clear
            </button>
          )}
        </div>
      </header>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length === 0 && !error && (
            <div className="h-full flex flex-col items-center justify-center text-center py-20">
              <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
                <span className="text-2xl font-bold text-amber-400">⚡</span>
              </div>
              <h2 className="text-xl font-semibold text-slate-200 mb-2">Start a conversation</h2>
              <p className="text-slate-400 text-sm max-w-xs">
                Ask anything. Your conversation is handled securely through the CRIT backend with Groq.
              </p>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-2xl px-4 py-3 rounded-lg ${
                  msg.sender === 'user'
                    ? 'bg-amber-600 text-white rounded-br-none'
                    : 'bg-slate-800 text-slate-100 rounded-bl-none border border-slate-700'
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {msg.text}
                </p>
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-800 border border-slate-700 px-4 py-3 rounded-lg rounded-bl-none">
                <div className="flex items-center gap-2">
                  <Loader className="w-4 h-4 animate-spin text-amber-400" />
                  <span className="text-sm text-slate-400">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="flex justify-center">
              <div className="bg-red-900 border border-red-700 text-red-100 px-4 py-3 rounded-lg flex items-center gap-2 max-w-2xl">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <footer className="border-t border-slate-700 bg-slate-800 px-6 py-4">
        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto">
          <div className="flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              disabled={loading}
              className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-amber-600 hover:bg-amber-700 disabled:bg-slate-700 disabled:text-slate-400 text-white px-5 py-3 rounded-lg transition flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
        </form>
      </footer>
    </div>
  );
}
