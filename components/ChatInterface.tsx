
import React, { useState, useRef, useEffect } from 'react';
import { Message, UserProfile, Document, DocumentChunk, AIProvider, GroqModel, AIResponse, GroundingSource } from '../types';
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
  useWebSearch: boolean;
  setUseWebSearch: (val: boolean) => void;
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
  onFirstMessage,
  useWebSearch,
  setUseWebSearch
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [retrieving, setRetrieving] = useState(false);
  const [isSearchingWeb, setIsSearchingWeb] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showHistoryIndicator, setShowHistoryIndicator] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const safeMessages = Array.isArray(messages) ? messages : [];

  useEffect(() => {
    if (currentChatId && messages.length > 0) {
      setShowHistoryIndicator(true);
      const timer = setTimeout(() => setShowHistoryIndicator(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [currentChatId]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
  }, [safeMessages, isLoading, retrieving, isSearchingWeb]);

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

    const userMsgId = Date.now().toString();
    const aiMsgId = (Date.now() + 1).toString();

    const userMessage: Message = {
      id: userMsgId,
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

    // Add placeholder for AI message with streaming flag
    const aiPlaceholder: Message = {
      id: aiMsgId,
      role: 'model',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    setMessages(prev => [...(Array.isArray(prev) ? prev : []), aiPlaceholder]);

    try {
      const relevantChunks = await performSemanticRetrieval(currentInput);
      const allDocTitles = documents.map(d => d.title);
      setRetrieving(false);

      if (relevantChunks.length === 0 && provider === 'gemini' && useWebSearch) {
        setIsSearchingWeb(true);
      }

      const activeHistory = !currentChatId ? [] : safeMessages;

      if (provider === 'groq') {
        const stream = groqService.askGroqStream(currentInput, activeHistory, profile, relevantChunks, allDocTitles, groqModel);
        for await (const chunk of stream) {
          setMessages(prev => prev.map(m =>
            m.id === aiMsgId ? { ...m, content: chunk.text, sources: chunk.sources } : m
          ));
        }
      } else {
        const stream = geminiService.askVoraStream(currentInput, activeHistory, profile, relevantChunks, allDocTitles, useWebSearch);
        for await (const chunk of stream) {
          setIsSearchingWeb(false); // Hide the status once we start getting tokens
          setMessages(prev => prev.map(m =>
            m.id === aiMsgId ? {
              ...m,
              content: chunk.text,
              sources: chunk.sources,
              groundingSources: chunk.groundingSources
            } : m
          ));
        }
      }

      // Clear streaming flag when finished
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, isStreaming: false } : m));
    } catch (err: any) {
      console.error(err);
      setMessages(prev => prev.map(m =>
        m.id === aiMsgId ? { ...m, content: `Intelligence sync failed: ${err.message || "Unknown error"}.`, isStreaming: false } : m
      ));
    } finally {
      setIsLoading(false);
      setRetrieving(false);
      setIsSearchingWeb(false);
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
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#020617] relative overflow-hidden antialiased overscroll-none">
      <div className="flex-shrink-0 h-14 lg:h-16 border-b border-slate-800/40 flex items-center px-4 lg:px-8 bg-slate-950/40 backdrop-blur-xl z-20 shadow-sm">
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
            <h2 className="font-bold text-slate-200 text-sm lg:text-base tracking-tight uppercase">VORA Assist</h2>
            <span className="text-[9px] lg:text-[10px] text-blue-500/80 font-bold uppercase tracking-[0.2em] mt-0.5">Brain Active</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 lg:gap-5">
          {showHistoryIndicator && (
            <span className="text-[9px] font-black text-green-500 uppercase tracking-widest animate-fade-in flex items-center gap-1.5 mr-2">
              <span className="w-1 h-1 rounded-full bg-green-500"></span>
              Context Restored
            </span>
          )}

          {provider === 'gemini' && (
            <button
              onClick={() => setUseWebSearch(!useWebSearch)}
              className={`group flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${useWebSearch
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                  : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400 hover:border-slate-700'
                }`}
              title={useWebSearch ? "Web Search Enabled" : "Enable Web Search"}
            >
              <svg className={`w-3.5 h-3.5 transition-transform duration-500 ${useWebSearch ? 'rotate-12 scale-110' : 'group-hover:rotate-12'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <span className="text-[9px] font-black uppercase tracking-widest hidden sm:inline">{useWebSearch ? 'Web ON' : 'Web OFF'}</span>
            </button>
          )}

          <span className={`text-[9px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-xl border flex items-center gap-2 ${provider === 'gemini' ? 'text-blue-500/60 border-blue-500/20 bg-blue-500/5' : 'text-orange-500/60 border-orange-500/20 bg-orange-500/5'
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

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 lg:px-24 lg:py-16 space-y-12 scroll-smooth bg-transparent relative z-10">
        {safeMessages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-8 animate-fade-in py-20">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-700 transform hover:scale-105 ${provider === 'gemini' ? 'bg-blue-600/10 border border-blue-500/20 text-blue-400' : 'bg-orange-600/10 border border-orange-500/20 text-orange-400'
              }`}>
              <span className="text-xl font-black">VA</span>
            </div>
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-slate-200 tracking-tight">Your Intelligent Assistant</h3>
              <p className="text-slate-500 text-[13px] font-medium leading-relaxed px-4">
                {documents.length > 0
                  ? `Accessing ${documents.length} specialized documents for context-aware responses.`
                  : "Upload documents to the Memory Bank to activate high-precision intelligence."
                }
              </p>
            </div>
          </div>
        )}

        {safeMessages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[95%] sm:max-w-[85%] lg:max-w-[85%] ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
              <div className={`inline-block px-5 py-4 lg:px-7 lg:py-5 rounded-2xl text-[14px] lg:text-[15px] leading-relaxed transition-all shadow-sm ${msg.role === 'user'
                  ? 'bg-slate-200 text-slate-900 font-medium rounded-tr-none text-left'
                  : 'bg-[#0f172a] border border-[#1e293b] text-slate-400 rounded-tl-none font-normal'
                }`}>
                {msg.role === 'user' ? (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                ) : (
                  msg.content === '' && msg.isStreaming ? (
                    <div className="flex gap-1.5 py-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-600 animate-bounce"></div>
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-600 animate-bounce [animation-delay:0.2s]"></div>
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-600 animate-bounce [animation-delay:0.4s]"></div>
                    </div>
                  ) : (
                    <div className="relative">
                      <div
                        className="markdown-content inline"
                        dangerouslySetInnerHTML={renderMarkdown(msg.content)}
                      />
                      {msg.isStreaming && <span className="typing-cursor"></span>}
                    </div>
                  )
                )}
              </div>

              <div className="mt-3 flex flex-col gap-2">
                {msg.sources && msg.sources.length > 0 && (
                  <div className="flex flex-wrap gap-2 justify-start px-1 opacity-60">
                    <span className="text-[8px] text-slate-600 font-bold uppercase tracking-widest self-center mr-1">Memory Bank:</span>
                    {msg.sources.map((s, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded-lg bg-slate-900/50 border border-slate-800 text-[8px] text-slate-500 font-bold uppercase tracking-tight">
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                {msg.groundingSources && msg.groundingSources.length > 0 && (
                  <div className="flex flex-wrap gap-2 justify-start px-1">
                    <span className="text-[8px] text-blue-500/60 font-bold uppercase tracking-widest self-center mr-1">Web Sources:</span>
                    {msg.groundingSources.map((s, idx) => (
                      <a
                        key={idx}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-cyan-500/5 border border-cyan-500/20 text-[8px] text-cyan-400 font-bold uppercase tracking-tight hover:bg-cyan-500/10 hover:border-cyan-500/40 transition-all shadow-lg shadow-cyan-500/5"
                      >
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                        {s.title}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {(retrieving || isSearchingWeb) && (
          <div className="flex justify-start">
            <div className="flex items-center gap-3 bg-slate-900/20 border border-slate-800/30 px-4 py-2 rounded-xl text-[9px] text-slate-600 font-bold tracking-widest uppercase">
              <div className="flex gap-1">
                <span className={`w-1 h-1 rounded-full animate-pulse ${isSearchingWeb ? 'bg-cyan-500' : 'bg-blue-500/40'}`}></span>
                <span className={`w-1 h-1 rounded-full animate-pulse delay-75 ${isSearchingWeb ? 'bg-cyan-500' : 'bg-blue-500/40'}`}></span>
              </div>
              {isSearchingWeb ? 'Consulting the Web...' : 'Retrieving context...'}
            </div>
          </div>
        )}
        <div className="h-4"></div>
      </div>

      <div className="flex-shrink-0 p-4 lg:p-12 bg-slate-950 lg:bg-gradient-to-t lg:from-slate-950 lg:via-slate-950/80 lg:to-transparent z-20 pb-safe shadow-[0_-10px_20px_-10px_rgba(2,6,23,0.5)]">
        <div className="max-w-4xl mx-auto">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-blue-600/5 rounded-3xl blur opacity-0 group-focus-within:opacity-100 transition duration-500"></div>
            <div className="relative flex items-end gap-2 bg-slate-900/60 border border-slate-800/40 rounded-3xl p-2 pl-5 pr-2 backdrop-blur-md transition-all shadow-xl">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message VORA..."
                className="flex-1 bg-transparent py-3 text-[14px] text-slate-300 focus:outline-none placeholder:text-slate-600 resize-none max-h-[180px] custom-scrollbar"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className={`w-10 h-10 mb-1 flex-shrink-0 transition-all rounded-xl flex items-center justify-center text-white shadow-lg ${provider === 'gemini' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-orange-600 hover:bg-orange-500'
                  } disabled:opacity-5 disabled:grayscale active:scale-95`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
