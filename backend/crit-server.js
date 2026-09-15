import express from 'express';
import cors from 'cors';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Setup CORS origins
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy blocked access from origin: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - Status: ${res.statusCode} (${duration}ms) [IP: ${req.ip}]`
    );
  });
  next();
});

// Rate limiter for chat endpoint (20 requests per minute per IP)
const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many chat requests from this IP, please try again in a minute.',
  },
});

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Store conversation history for context in memory with TTL support
// Structure: Map<string, { history: Array<{role: string, content: string}>, lastAccessed: number }>
const conversationStore = new Map();

// Periodic cleanup for stale sessions (runs every 30 minutes, expires sessions older than 1 hour)
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
setInterval(() => {
  const now = Date.now();
  let deletedCount = 0;
  for (const [sessionId, sessionData] of conversationStore.entries()) {
    if (now - sessionData.lastAccessed > SESSION_TTL_MS) {
      conversationStore.delete(sessionId);
      deletedCount++;
    }
  }
  if (deletedCount > 0) {
    console.log(`[Cleanup] Pruned ${deletedCount} expired conversation sessions.`);
  }
}, 30 * 60 * 1000);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeSessions: conversationStore.size,
    timestamp: new Date().toISOString(),
  });
});

// Core Chat Handler
const handleChat = async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    // Validate message
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required and must be a string.' });
    }

    const trimmedMessage = message.trim();
    if (trimmedMessage.length === 0) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }

    if (trimmedMessage.length > 4000) {
      return res.status(400).json({ error: 'Message is too long. Maximum allowed length is 4000 characters.' });
    }

    // Sanitize session identifier
    const session = typeof sessionId === 'string' && sessionId.length <= 100 ? sessionId : 'default';

    // Retrieve or initialize session state
    if (!conversationStore.has(session)) {
      conversationStore.set(session, {
        history: [],
        lastAccessed: Date.now(),
      });
    }

    const sessionData = conversationStore.get(session);
    sessionData.lastAccessed = Date.now();

    // Append user query to history
    sessionData.history.push({
      role: 'user',
      content: trimmedMessage,
    });

    // System prompt configuration
    const systemPrompt = {
      role: 'system',
      content:
        'You are CRIT, a helpful AI assistant for the CRITERIA Studio. You provide thoughtful, concise responses. You are knowledgeable about web development, design, and creative projects.',
    };

    // Prepare message payload
    const messagesWithSystem = [systemPrompt, ...sessionData.history];

    // Call Groq API
    const response = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      max_tokens: 1024,
      messages: messagesWithSystem,
    });

    const assistantMessage = response.choices[0]?.message?.content || 'Unable to generate response';

    // Append assistant response to history
    sessionData.history.push({
      role: 'assistant',
      content: assistantMessage,
    });

    // Keep history manageable (keep last 20 messages)
    if (sessionData.history.length > 20) {
      sessionData.history = sessionData.history.slice(-20);
    }

    res.json({
      response: assistantMessage,
      sessionId: session,
    });
  } catch (error) {
    console.error('Groq API / Chat Error:', error);

    if (error.status === 401) {
      return res.status(401).json({
        error: 'Authentication failed. Please verify the backend GROQ_API_KEY.',
      });
    }

    if (error.status === 429) {
      return res.status(429).json({
        error: 'Groq API rate limit reached. Please wait a moment and try again.',
      });
    }

    res.status(500).json({
      error: error.message || 'Internal server error while processing request.',
    });
  }
};

// Core Clear Session Handler
const handleClearSession = (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = typeof sessionId === 'string' && sessionId.length <= 100 ? sessionId : 'default';

    conversationStore.delete(session);
    res.json({ success: true, message: `Session ${session} cleared successfully` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Versioned routes (v1)
app.post('/api/v1/chat', chatLimiter, handleChat);
app.post('/api/v1/clear-session', handleClearSession);

// Backward compatibility routes
app.post('/api/chat', chatLimiter, handleChat);
app.post('/api/clear-session', handleClearSession);

// Global unhandled error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ error: err.message || 'An unexpected server error occurred.' });
});

// Start server
app.listen(port, () => {
  console.log(`✓ CRIT server running on port ${port}`);
  console.log(`✓ CORS allowed origins: ${allowedOrigins.join(', ')}`);
  console.log(`✓ Health check: http://localhost:${port}/health`);
  console.log(`✓ Chat endpoint: POST /api/v1/chat (and /api/chat)`);
  console.log(`✓ Groq API Key configured: ${process.env.GROQ_API_KEY ? 'Yes' : 'No'}`);
});
