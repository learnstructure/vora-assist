
// Fix: Removed the unnecessary second argument from the getEmbedding call.
import React, { useState, useRef, useEffect } from 'react';
import { Message, UserProfile, Document, DocumentChunk, AIProvider, GroqModel, AIResponse, GroundingSource } from '../types';
import { geminiService } from '../services/geminiService';
import { groqService } from '../services/groqService';
import { marked } from 'marked';
import katex from 'katex';

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
  const [isReranking, setIsReranking] = useState(false);
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

    marked.use({
      renderer,
      extensions: [
        {
          name: 'inlineMath',
          level: 'inline',
          start(src) { return src.indexOf('$'); },
          tokenizer(src) {
            const match = src.match(/^\$([^$]+)\$/);
            if (match) {
              return {
                type: 'inlineMath',
                raw: match[0],
                text: match[1].trim()
              };
            }
          },
          renderer(token) {
            try {
              return katex.renderToString(token.text, { displayMode: false, throwOnError: false });
            } catch (e) {
              return token.raw;
            }
          }
        },
        {
          name: 'blockMath',
          level: 'block',
          start(src) { return src.indexOf('$$'); },
          tokenizer(src) {
            const match = src.match(/^\$\$([\s\S]+?)\$\$/);
            if (match) {
              return {
                type: 'blockMath',
                raw: match[0],
                text: match[1].trim()
              };
            }
          },
          renderer(token) {
            try {
              const html = katex.renderToString(token.text, { displayMode: true, throwOnError: false });
              return `<div class="math-block">${html}</div>`;
            } catch (e) {
              return `<div class="math-block">${token.raw}</div>`;
            }
          }
        }
      ]
    });

    (window as any).copyToClipboard = (btn: HTMLButtonElement, codeId: string) => {
      const codeElement = document.getElementById(codeId);
      if (codeElement) {
        navigator.clipboard.writeText(codeElement.innerText).then(() => {
          const originalText = btn.innerText;
          btn.innerText = 'Copied!';
          setTimeout(() => {
            btn.innerText = originalText;
          }, 2000);
        });
      }
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [safeMessages, isLoading, retrieving, isSearchingWeb, isReranking]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const performHybridRetrieval = async (query: string): Promise<DocumentChunk[]> => {
    if (cachedChunks.length === 0) return [];

    try {
      // Fix: Removed the unnecessary second argument from the getEmbedding call
      const queryEmbedding = await geminiService.getEmbedding(query);
      const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 2);

      const scoredChunks = cachedChunks.map(chunk => {
        // Vector Score
        const vectorSimilarity = geminiService.cosineSimilarity(queryEmbedding, chunk.embedding);

        // Text Match Score (Keyword match)
        let textScore = 0;
        const chunkTextLower = chunk.text.toLowerCase();
        queryWords.forEach(word => {
          if (chunkTextLower.includes(word)) textScore += 0.15;
        });

        const hybridScore = (vectorSimilarity * 0.7) + (textScore * 0.3);
        return { chunk, score: hybridScore };
      });

      const topCandidates = scoredChunks
        .filter(item => item.score > 0.3)
        .sort((a, b) => b.score - a.score)
        .slice(0, 15)
        .map(item => item.chunk);

      if (topCandidates.length > 0) {
        setIsReranking(true);
        const refined = await geminiService.rerankChunks(query, topCandidates);
        setIsReranking(false);
        return refined;
      }

      return [];
    } catch (e) {
      console.warn("Memory retrieval paused", e);
      return [];
    } finally {
      setIsReranking(false);
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
      setMessages(prev => [...prev, userMessage]);
    }

    const aiPlaceholder: Message = {
      id: aiMsgId,
      role: 'model',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    setMessages(prev => [...prev, aiPlaceholder]);

    try {
      const relevantChunks = await performHybridRetrieval(currentInput);
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
          setIsSearchingWeb(false);
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
      setIsReranking(false);
    }
  };

  const renderMarkdown = (content: string) => {
    try {
      return { __html: marked.parse(content) as string };
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
    <div className="flex flex-col h-full bg-[var(--bg-deep)] relative overflow-hidden antialiased overscroll-none transition-colors duration-300">
      <div className="flex-shrink-0 h-14 lg:h-16 border-b border-[var(--border-muted)] flex items-center px-4 lg:px-8 bg-[var(--bg-sidebar)]/40 backdrop-blur-xl z-20 shadow-sm">
        <div className="flex items-center gap-3">
          {toggleSidebar && (
            <button
              onClick={toggleSidebar}
              className="lg:hidden p-2 -ml-2 text-[var(--text-main)] hover:text-[var(--text-heading)] transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
          )}
          <div className="flex flex-col">
            <h2 className="font-bold text-[var(--text-heading)] text-sm lg:text-base tracking-tight uppercase">VORA Assist</h2>
            <span className="text-[9px] lg:text-[10px] text-blue-500 font-bold uppercase tracking-[0.2em] mt-0.5">Brain Active</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 lg:gap-5">
          {showHistoryIndicator && (
            <span className="text-[9px] font-black text-green-500 uppercase tracking-widest animate-fade-in flex items-center gap-1.5 mr-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              Context Restored
            </span>
          )}

          {provider === 'gemini' && (
            <button
              onClick={() => setUseWebSearch(!useWebSearch)}
              className={`group flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${useWebSearch
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-500'
                  : 'bg-[var(--bg-card)] border-[var(--border-muted)] text-[var(--text-main)] hover:text-[var(--text-heading)]'
                }`}
            >
              <svg className={`w-3.5 h-3.5 transition-transform duration-500 ${useWebSearch ? 'rotate-12 scale-110' : 'group-hover:rotate-12'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <span className="text-[9px] font-black uppercase tracking-widest hidden sm:inline">{useWebSearch ? 'Web ON' : 'Web OFF'}</span>
            </button>
          )}

          <span className={`text-[9px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-xl border flex items-center gap-2 ${provider === 'gemini' ? 'text-blue-500 border-blue-500/20 bg-blue-500/5' : 'text-orange-500 border-orange-500/20 bg-orange-500/5'
            }`}>
            {provider === 'gemini' ? 'Gemini 3 Flash' : (
              <>
                <span className={`w-1 h-1 rounded-full animate-pulse ${groqModel === 'openai/gpt-oss-120b' ? 'bg-purple-500' : 'bg-orange-500'}`}></span>
                {groqModel === 'openai/gpt-oss-120b' ? 'GPT OSS' : 'Groq Llama'}
              </>
            )}
          </span>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 lg:px-24 lg:py-16 space-y-12 scroll-smooth bg-transparent relative z-10">
        {safeMessages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-8 animate-fade-in py-20">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-700 transform hover:scale-105 ${provider === 'gemini' ? 'bg-blue-600/10 border border-blue-500/20 text-blue-500' : 'bg-orange-600/10 border border-orange-500/20 text-orange-500'
              }`}>
              <span className="text-xl font-black">VA</span>
            </div>
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-[var(--text-heading)] tracking-tight">Your Intelligent Assistant</h3>
              <p className="text-[var(--text-main)] text-[13px] font-medium leading-relaxed px-4 opacity-70">
                {documents.length > 0
                  ? `VORA is using Hybrid Retrieval across ${documents.length} structured documents.`
                  : "Upload documents to the Memory Bank. They will be parsed with Vision for high precision."
                }
              </p>
            </div>
          </div>
        )}

        {safeMessages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[95%] sm:max-w-[85%] lg:max-w-[85%] ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
              <div className={`inline-block px-5 py-4 lg:px-7 lg:py-5 rounded-2xl text-[14px] lg:text-[15px] leading-relaxed transition-all shadow-sm ${msg.role === 'user'
                  ? 'bg-slate-800 text-white font-medium rounded-tr-none text-left shadow-lg'
                  : 'bg-[var(--bg-card)] border border-[var(--border-muted)] text-[var(--text-main)] rounded-tl-none font-normal'
                }`}>
                {msg.role === 'user' ? (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                ) : (
                  msg.content === '' && msg.isStreaming ? (
                    <div className="flex gap-1.5 py-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce"></div>
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:0.2s]"></div>
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:0.4s]"></div>
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
                    <span className="text-[8px] text-[var(--text-main)] font-bold uppercase tracking-widest self-center mr-1">Memory Bank:</span>
                    {msg.sources.map((s, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-muted)] text-[8px] text-[var(--text-main)] font-bold uppercase tracking-tight">
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
                        className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-cyan-500/5 border border-cyan-500/20 text-[8px] text-cyan-500 font-bold uppercase tracking-tight hover:bg-cyan-500/10 hover:border-cyan-500/40 transition-all shadow-sm"
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

        {(retrieving || isSearchingWeb || isReranking) && (
          <div className="flex justify-start">
            <div className="flex items-center gap-3 bg-[var(--bg-card)]/40 border border-[var(--border-muted)] px-4 py-2 rounded-xl text-[9px] text-[var(--text-main)] font-bold tracking-widest uppercase shadow-sm">
              <div className="flex gap-1">
                <span className={`w-1 h-1 rounded-full animate-pulse ${isSearchingWeb ? 'bg-cyan-500' : isReranking ? 'bg-purple-500' : 'bg-blue-500/40'}`}></span>
                <span className={`w-1 h-1 rounded-full animate-pulse delay-75 ${isSearchingWeb ? 'bg-cyan-500' : isReranking ? 'bg-purple-500' : 'bg-blue-500/40'}`}></span>
              </div>
              {isSearchingWeb ? 'Consulting the Web...' : isReranking ? 'Reasoning for Precision...' : 'Retrieving context...'}
            </div>
          </div>
        )}
        <div className="h-4"></div>
      </div>

      <div className="flex-shrink-0 p-4 lg:p-12 bg-transparent lg:bg-gradient-to-t lg:from-[var(--bg-deep)] lg:via-[var(--bg-deep)]/90 lg:to-transparent z-20 pb-safe shadow-none">
        <div className="max-w-4xl mx-auto">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-blue-600/5 rounded-3xl blur opacity-0 group-focus-within:opacity-100 transition duration-500"></div>
            <div className="relative flex items-end gap-2 bg-[var(--bg-card)] border border-[var(--border-muted)] rounded-3xl p-2 pl-5 pr-2 backdrop-blur-md transition-all shadow-xl">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask VORA about your documents..."
                className="flex-1 bg-transparent py-3 text-[14px] text-[var(--text-heading)] focus:outline-none placeholder:text-[var(--text-main)]/50 resize-none max-h-[180px] custom-scrollbar"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className={`w-10 h-10 mb-1 flex-shrink-0 transition-all rounded-xl flex items-center justify-center text-white shadow-lg ${provider === 'gemini' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-orange-600 hover:bg-orange-500'
                  } disabled:opacity-5 active:scale-95`}
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
