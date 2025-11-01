import { ChatSession } from '@google/generative-ai';

export interface ChatMessage {
  role: 'user' | 'model';
  message: string;
  timestamp: Date;
}

export interface SessionData {
  chat: ChatSession;
  history: ChatMessage[];
  createdAt: Date;
  lastUsed: Date;
}

export interface ChatRequest {
  message: string;
}

export interface ChatResponse {
  success: boolean;
  sessionId: string;
  response: string;
  messageCount: number;
}

export interface ErrorResponse {
  error: string;
  details?: string;
}

export interface HealthResponse {
  status: 'ok';
  sessions: number;
  systemPrompt: string;
}

export interface SessionInfoResponse {
  sessionId: string;
  hasActiveSession: boolean;
  messageCount: number;
  createdAt: Date | null;
  lastUsed: Date | null;
}

export interface HistoryResponse {
  sessionId: string;
  history: ChatMessage[];
  messageCount: number;
}

export interface ClearSessionResponse {
  success: boolean;
  message: string;
  sessionId: string;
}

export interface CacheRefreshResponse {
  success: boolean;
  message: string;
  cachedContentName: string;
  clearedSessions: number;
}
