
import React, { useState, useRef, useEffect } from 'react';
import { Message, UserProfile, Document, DocumentChunk, AIProvider, GroqModel } from '../types';
import { geminiService } from '../services/geminiService';
import { groqService } from '../services/groqService';
import { marked } from 'marked';

interface ChatInterfaceProps {
  messages: Message[];
  setMessages: (msgs: Message[] | ((prev: Message[]) => Message[])) => void;
  profile: UserProfile;
  documents: Document[];
  cachedChunks: DocumentChunk[];
  provider: AIProvider;
  groqModel: GroqModel;
  toggleSidebar?: () => void;
  currentChatId: string | null;
  onFirstMessage: (m: Message) => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages = [],
  setMessages,
  profile,
  documents = [],
  cachedChunks = [],
  provider,
  groqModel,
  toggleSidebar,
  currentChatId,
  onFirstMessage
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [retrieving, setRetrieving] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const safeMessages = Array.isArray(messages) ? messages : [];

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    };
    checkMobile();
  }, []);

  // Custom marked renderer for code blocks with copy buttons
  useEffect(() => {
    const renderer = new marked.Renderer();
    renderer.code = ({ text, lang }) => {
      const id = `code-${Math.random().toString(36).substr(2, 9)}`;
      return `
        <div class="code-block-wrapper">
          <button class="copy-button" onclick="copyToClipboard(this, '${id}')">Copy</button>
          <pre><code id="${id}">${text}</code></pre>
        </div>
      `;
    };
    marked.setOptions({ renderer });

    // Global helper for the copy buttons
    (window as any).copyToClipboard = (btn: HTMLButtonElement, codeId: string) => {
      const codeElement = document.getElementById(codeId);
      if (codeElement) {
        navigator.clipboard.writeText(codeElement.innerText).then(() => {
          const originalText = btn.innerText;
          btn.innerText = 'Copied!';
          btn.classList.add('copied');
          setTimeout(() => {
            btn.innerText = originalText;
            btn.classList.remove('copied');
          }, 2000);
        });
      }
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [safeMessages, isLoading, retrieving]);

  // Handle textarea auto-resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const performSemanticRetrieval = async (query: string): Promise<DocumentChunk[]> => {
    if (cachedChunks.length === 0) return [];

    try {
      const queryEmbedding = await geminiService.getEmbedding(query, true);

      const scoredChunks = cachedChunks.map(chunk => {
        const similarity = geminiService.cosineSimilarity(queryEmbedding, chunk.embedding);
        return { chunk, score: similarity };
      });

      return scoredChunks
        .filter(item => item.score > 0.35)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map(item => item.chunk);
    } catch (e) {
      console.warn("Memory retrieval paused", e);
      return [];
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

    const currentInput = input;
    setInput('');
    setIsLoading(true);
    setRetrieving(true);

    if (!currentChatId) {
      onFirstMessage(userMessage);
    } else {
      setMessages(prev => [...(Array.isArray(prev) ? prev : []), userMessage]);
    }

    try {
      const relevantChunks = await performSemanticRetrieval(currentInput);
      const allDocTitles = documents.map(d => d.title);
      setRetrieving(false);

      let response;
      const activeHistory = !currentChatId ? [] : safeMessages;

      if (provider === 'groq') {
        response = await groqService.askGroq(currentInput, activeHistory, profile, relevantChunks, allDocTitles, groqModel);
      } else {
        response = await geminiService.askVora(currentInput, activeHistory, profile, relevantChunks, allDocTitles);
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: response.text,
        timestamp: Date.now(),
        sources: response.sources,
      };

      setMessages(prev => [...(Array.isArray(prev) ? prev : []), aiMessage]);
    } catch (err: any) {
      console.error(err);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: `Intelligence sync failed: ${err.message || "Unknown error"}.`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...(Array.isArray(prev) ? prev : []), errorMessage]);
    } finally {
      setIsLoading(false);
      setRetrieving(false);
    }
  };

  const renderMarkdown = (content: string) => {
    try {
      return { __html: marked.parse(content) };
    } catch (e) {
      return { __html: content };
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl+Enter or Cmd+Enter to send. Enter alone just adds a new line.
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const getPlaceholder = () => {
    if (isMobile) return "Type a message...";
    return "Type a message (Ctrl+Enter to send)...";
  };

  return (
    <div className="flex flex-col h-full bg-[#020617] relative overflow-hidden antialiased">
      <div className="h-14 lg:h-16 border-b border-slate-800/60 flex items-center px-4 lg:px-8 bg-slate-950/40 backdrop-blur-xl z-20 sticky top-0 shadow-sm">
        <div className="flex items-center gap-3">
          {toggleSidebar && (
            <button
              onClick={toggleSidebar}
              className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
          )}
          <div className="flex flex-col">
            <h2 className="font-black text-slate-100 text-sm lg:text-base tracking-tighter leading-none uppercase">VORA Assist</h2>
            <span className="text-[9px] lg:text-[10px] text-blue-400 font-black uppercase tracking-[0.2em] mt-0.5">Brain Active</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 lg:gap-4">
          <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-xl border flex items-center gap-2 ${provider === 'gemini' ? 'text-blue-400 border-blue-500/20 bg-blue-500/10' : 'text-orange-400 border-orange-500/20 bg-orange-500/10'
            }`}>
            {provider === 'gemini' ? 'Gemini 3 Flash' : (
              <>
                <span className={`w-1 h-1 rounded-full animate-pulse ${groqModel === 'openai/gpt-oss-120b' ? 'bg-purple-500' : 'bg-orange-500'}`}></span>
                {groqModel === 'openai/gpt-oss-120b' ? 'GPT OSS 120B' : 'Groq Llama 3.3'}
              </>
            )}
          </span>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 lg:px-24 lg:py-16 space-y-12 pb-44 lg:pb-40 scroll-smooth">
        {safeMessages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-8 animate-fade-in py-20">
            <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center shadow-2xl transition-all duration-700 transform hover:rotate-6 ${provider === 'gemini' ? 'bg-blue-600 shadow-blue-500/30' : 'bg-orange-600 shadow-orange-500/30'
              }`}>
              <span className="text-white text-2xl font-black">VA</span>
            </div>
            <div className="space-y-4">
              <h3 className="text-2xl font-black text-white tracking-tighter">Your Intelligent Assistant</h3>
              <p className="text-slate-400 text-[13px] font-medium leading-relaxed px-4">
                {documents.length > 0
                  ? `I'm ready to search your ${documents.length} documents to provide high-precision intelligence.`
                  : "Initialize my memory by uploading documents to the Memory Bank to begin our context-aware partnership."
                }
              </p>
            </div>
          </div>
        )}

        {safeMessages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[95%] sm:max-w-[85%] lg:max-w-[85%] ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
              <div className={`inline-block px-6 py-4 lg:px-8 lg:py-5 rounded-[2rem] text-[15px] lg:text-[16px] leading-relaxed transition-all shadow-md ${msg.role === 'user'
                  ? 'bg-slate-100 text-slate-800 font-semibold rounded-tr-none text-left'
                  : 'bg-slate-900/40 backdrop-blur-sm text-slate-400 border border-slate-800/80 rounded-tl-none font-medium'
                }`}>
                {msg.role === 'user' ? (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                ) : (
                  <div
                    className="markdown-content"
                    dangerouslySetInnerHTML={renderMarkdown(msg.content)}
                  />
                )}
              </div>

              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 justify-start px-2">
                  <span className="text-[9px] text-slate-600 font-black uppercase tracking-widest self-center mr-1">Context:</span>
                  {msg.sources.map((s, idx) => (
                    <span key={idx} className="px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 text-[9px] text-slate-500 font-bold uppercase tracking-tight hover:text-blue-400 transition-colors">
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
            <div className="flex items-center gap-3 bg-slate-900/40 border border-slate-800/50 px-5 py-2.5 rounded-2xl text-[9px] text-slate-500 font-black tracking-widest uppercase">
              <div className="flex gap-1">
                <span className="w-1 h-1 bg-blue-500 rounded-full animate-ping"></span>
                <span className="w-1 h-1 bg-blue-500 rounded-full animate-ping delay-75"></span>
              </div>
              Syncing Memory (Vector)
            </div>
          </div>
        )}

        {isLoading && !retrieving && (
          <div className="flex justify-start animate-pulse">
            <div className="bg-slate-900/50 border border-slate-800 px-8 py-5 rounded-[2rem] rounded-tl-none">
              <div className="flex gap-2.5">
                <div className={`w-2 h-2 rounded-full animate-bounce ${provider === 'gemini' ? 'bg-blue-600/60' : 'bg-orange-600/60'}`}></div>
                <div className={`w-2 h-2 rounded-full animate-bounce [animation-delay:0.2s] ${provider === 'gemini' ? 'bg-blue-600/60' : 'bg-orange-600/60'}`}></div>
                <div className={`w-2 h-2 rounded-full animate-bounce [animation-delay:0.4s] ${provider === 'gemini' ? 'bg-blue-600/60' : 'bg-orange-600/60'}`}></div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 lg:p-12 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent pb-10 lg:pb-12">
        <div className="max-w-4xl mx-auto flex flex-col gap-2">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/10 to-cyan-500/10 rounded-[2rem] blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
            <div className="relative flex items-end gap-2 bg-slate-900/80 border border-slate-800/50 rounded-3xl p-2 pl-6 pr-2 backdrop-blur-md shadow-2xl focus-within:ring-1 focus-within:ring-slate-700 transition-all">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={getPlaceholder()}
                className="flex-1 bg-transparent py-4 text-[15px] text-slate-300 focus:outline-none placeholder:text-slate-600 resize-none max-h-[200px] custom-scrollbar"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className={`w-12 h-12 mb-1 flex-shrink-0 transition-all rounded-2xl flex items-center justify-center text-white shadow-lg ${provider === 'gemini' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-orange-600 hover:bg-orange-500'
                  } disabled:opacity-5 disabled:grayscale active:scale-90`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
