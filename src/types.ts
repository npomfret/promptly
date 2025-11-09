import { CachedContent, ChatSession } from '@google/generative-ai';

export interface ChatMessage {
    role: 'user' | 'model';
    message: string;
    timestamp: Date;
}

export interface Project {
    id: string;
    gitUrl: string;
    branch: string;
    path: string;
    accessToken?: string; // Optional Personal Access Token for private repos
    cachedContent?: CachedContent;
    cacheStale?: boolean;
    lastUpdated: Date;
    status?: 'cloning' | 'ready' | 'error';
    errorMessage?: string;
}

export interface ProjectConfig {
    gitUrl: string;
    branch?: string;
    accessToken?: string; // Optional Personal Access Token for private repos
}

export interface ProjectsConfigFile {
    projects: ProjectConfig[];
}

export interface SessionData {
    projectId: string;
    mode: 'enhance' | 'ask';
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
    projectId: string;
    response: string;
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
    projectId: string | null;
    hasActiveSession: boolean;
    createdAt: Date | null;
    lastUsed: Date | null;
}

export interface HistoryResponse {
    sessionId: string;
    projectId: string;
    history: ChatMessage[];
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

export interface ProjectInfo {
    id: string;
    gitUrl: string;
    branch: string;
    path: string;
    lastUpdated: Date;
}

export interface ProjectsListResponse {
    projects: ProjectInfo[];
}

export interface AddProjectRequest {
    gitUrl: string;
    branch?: string;
    accessToken?: string; // Optional Personal Access Token for private repos
}

export interface AddProjectResponse {
    success: boolean;
    message: string;
    project: ProjectInfo;
}

export interface RemoveProjectResponse {
    success: boolean;
    message: string;
    projectId: string;
}
