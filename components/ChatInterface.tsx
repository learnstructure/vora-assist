
import React, { useState, useRef, useEffect } from 'react';
import { Message, UserProfile, Document, DocumentChunk, AIProvider } from '../types';
import { geminiService } from '../services/geminiService';
import { groqService } from '../services/groqService';
import { storageService } from '../services/storageService';

interface ChatInterfaceProps {
  messages: Message[];
  setMessages: (msgs: Message[] | ((prev: Message[]) => Message[])) => void;
  profile: UserProfile;
  documents: Document[];
  cachedChunks: DocumentChunk[];
  provider: AIProvider;
  toggleSidebar?: () => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  setMessages,
  profile,
  documents,
  cachedChunks,
  provider,
  toggleSidebar
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [retrieving, setRetrieving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, retrieving]);

  const performSemanticRetrieval = async (query: string): Promise<DocumentChunk[]> => {
    if (cachedChunks.length === 0) return [];

    try {
      const queryEmbedding = provider === 'groq'
        ? await groqService.getEmbedding(query)
        : await geminiService.getEmbedding(query);

      const scoredChunks = cachedChunks.map(chunk => {
        const similarity = provider === 'groq'
          ? groqService.cosineSimilarity(queryEmbedding, chunk.embedding)
          : geminiService.cosineSimilarity(queryEmbedding, chunk.embedding);

        return {
          chunk,
          score: similarity
        };
      });

      return scoredChunks
        .filter(item => item.score > 0.4)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(item => item.chunk);
    } catch (e) {
      console.warn("Retrieval skipped due to missing provider keys or errors:", e);
      return [];
    }
  };

  const clearHistory = async () => {
    if (confirm("Clear current conversation history? This cannot be undone.")) {
      await storageService.saveChat([]);
      setMessages([]);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setIsLoading(true);
    setRetrieving(true);

    try {
      const relevantChunks = await performSemanticRetrieval(currentInput);
      setRetrieving(false);

      let response;
      if (provider === 'groq') {
        response = await groqService.askGroq(currentInput, messages, profile, relevantChunks);
      } else {
        response = await geminiService.askPI(currentInput, messages, profile, relevantChunks);
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: response.text,
        timestamp: Date.now(),
        sources: response.sources,
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (err: any) {
      console.error(err);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: `I encountered an error: ${err.message || "Unknown error"}. Please check your API configuration in .env.local.`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setRetrieving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 relative overflow-hidden">
      <div className="h-14 lg:h-16 border-b border-zinc-900 flex items-center px-4 lg:px-8 bg-zinc-950/80 backdrop-blur-xl z-20 sticky top-0">
        <div className="flex items-center gap-3">
          {toggleSidebar && (
            <button
              onClick={toggleSidebar}
              className="lg:hidden p-2 -ml-2 text-zinc-500 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
          )}
          <div className="flex flex-col">
            <h2 className="font-black text-zinc-100 text-sm lg:text-base tracking-tighter leading-none uppercase">VORA Assist</h2>
            <span className="text-[9px] lg:text-[10px] text-blue-500 font-black uppercase tracking-[0.2em] mt-0.5">Brain Active</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 lg:gap-4">
          {messages.length > 0 && (
            <button
              onClick={clearHistory}
              className="text-[10px] font-black text-zinc-500 hover:text-red-500 uppercase tracking-widest transition-colors mr-2 hidden sm:block"
            >
              Clear Chat
            </button>
          )}
          <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-xl border ${provider === 'gemini' ? 'text-blue-400 border-blue-500/20 bg-blue-500/5' : 'text-orange-400 border-orange-500/20 bg-orange-500/5'
            }`}>
            {provider === 'gemini' ? 'Gemini 3 Pro' : 'Groq LPU'}
          </span>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 lg:px-20 lg:py-12 space-y-10 pb-32 scroll-smooth">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-8 animate-fade-in">
            <div className={`w-24 h-24 rounded-[2.5rem] flex items-center justify-center shadow-2xl transition-all duration-700 transform hover:rotate-6 ${provider === 'gemini' ? 'bg-blue-600 shadow-blue-500/20' : 'bg-orange-600 shadow-orange-500/20'
              }`}>
              <span className="text-white text-3xl font-black">VA</span>
            </div>
            <div className="space-y-4">
              <h3 className="text-3xl font-black text-white tracking-tighter">Your Intelligence Partner.</h3>
              <p className="text-zinc-500 text-sm font-medium leading-relaxed">
                I'm VORA Assist. I've indexed your context as {profile.role || 'a professional'}. Use me to query your {documents.length} local documents via {provider.toUpperCase()}.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[95%] sm:max-w-[85%] lg:max-w-[75%] ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
              <div className={`inline-block px-6 py-4 rounded-[1.8rem] text-sm lg:text-[15px] leading-relaxed transition-all shadow-sm ${msg.role === 'user'
                  ? 'bg-zinc-100 text-black font-semibold rounded-tr-none'
                  : 'bg-zinc-900 text-zinc-200 border border-zinc-800 rounded-tl-none'
                }`}>
                {msg.content.split('\n').map((line, i) => (
                  <div key={i} className={line ? 'mb-2 last:mb-0' : 'h-3'}>{line}</div>
                ))}
              </div>

              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 justify-start">
                  {msg.sources.map((s, idx) => (
                    <span key={idx} className="px-3 py-1 rounded-xl bg-zinc-900 border border-zinc-800 text-[9px] text-zinc-500 font-black uppercase tracking-widest hover:text-blue-400 transition-colors">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {retrieving && (
          <div className="flex justify-start">
            <div className="flex items-center gap-3 bg-zinc-900/40 border border-zinc-800/50 px-5 py-2.5 rounded-2xl text-[9px] text-zinc-500 font-black tracking-widest uppercase">
              <div className="flex gap-1">
                <span className="w-1 h-1 bg-orange-500 rounded-full animate-ping"></span>
                <span className="w-1 h-1 bg-orange-500 rounded-full animate-ping delay-75"></span>
              </div>
              Memory Lookup Active
            </div>
          </div>
        )}

        {isLoading && !retrieving && (
          <div className="flex justify-start animate-pulse">
            <div className="bg-zinc-900 border border-zinc-800 px-6 py-4 rounded-2xl rounded-tl-none">
              <div className="flex gap-2">
                <div className={`w-2 h-2 rounded-full animate-bounce ${provider === 'gemini' ? 'bg-blue-600' : 'bg-orange-600'}`}></div>
                <div className={`w-2 h-2 rounded-full animate-bounce [animation-delay:0.2s] ${provider === 'gemini' ? 'bg-blue-600' : 'bg-orange-600'}`}></div>
                <div className={`w-2 h-2 rounded-full animate-bounce [animation-delay:0.4s] ${provider === 'gemini' ? 'bg-blue-600' : 'bg-orange-600'}`}></div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 lg:p-12 bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent">
        <div className="max-w-4xl mx-auto relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={`Query local memory with ${provider.toUpperCase()}...`}
            className="w-full bg-zinc-900/60 border border-zinc-800/50 rounded-3xl px-8 py-6 pr-20 text-[15px] text-white focus:outline-none focus:ring-1 focus:ring-zinc-700 transition-all placeholder:text-zinc-600 backdrop-blur-md shadow-2xl"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className={`absolute right-4 top-4 bottom-4 w-12 lg:w-16 transition-all rounded-2xl flex items-center justify-center text-white shadow-2xl ${provider === 'gemini' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-orange-600 hover:bg-orange-500'
              } disabled:opacity-5`}
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
