
export interface UserProfile {
  name: string;
  role: string;
  company: string;
  bio: string;
  technicalStack: string[];
  interests: string[];
  lastUpdated: number;
}

export interface Document {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'markdown' | 'code' | 'pdf' | 'docx' | 'html';
  category: string;
  tags: string[];
  createdAt: number;
}

export interface DocumentChunk {
  id: string;
  docId: string;
  docTitle: string;
  text: string;
  embedding: number[];
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  sources?: string[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

export type AIProvider = 'gemini' | 'groq';
export type GroqModel = 'llama-3.3-70b-versatile' | 'openai/gpt-oss-120b';

export interface AppState {
  profile: UserProfile;
  documents: Document[];
  messages: Message[];
  isSearching: boolean;
  provider: AIProvider;
  groqModel: GroqModel;
  sessions: ChatSession[];
  currentChatId: string | null;
}
