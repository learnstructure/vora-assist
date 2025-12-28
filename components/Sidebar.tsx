
import React from 'react';
import { AIProvider, ChatSession, GroqModel } from '../types';

interface SidebarProps {
  activeTab: 'chat' | 'knowledge' | 'profile';
  setActiveTab: (tab: 'chat' | 'knowledge' | 'profile') => void;
  provider: AIProvider;
  setProvider: (p: AIProvider) => void;
  groqModel: GroqModel;
  setGroqModel: (m: GroqModel) => void;
  onClose?: () => void;
  sessions: ChatSession[];
  currentChatId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  provider,
  setProvider,
  groqModel,
  setGroqModel,
  onClose,
  sessions = [],
  currentChatId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  theme,
  setTheme
}) => {
  const navItems = [
    {
      id: 'chat', label: 'VORA Assist', icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
      )
    },
    {
      id: 'knowledge', label: 'Memory Bank', icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
      )
    },
    {
      id: 'profile', label: 'Identity', icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
      )
    },
  ];

  const safeSessions = Array.isArray(sessions) ? sessions.filter(s => s && s.id) : [];

  return (
    <div className="flex flex-col h-full bg-[var(--bg-sidebar)] border-r border-[var(--border-muted)] shadow-2xl lg:shadow-none transition-colors duration-300">
      <div className="p-6 flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center justify-between mb-8 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-700 via-blue-600 to-cyan-500 flex items-center justify-center font-black text-white text-base shadow-2xl shadow-blue-500/20 ring-1 ring-white/10 transform -rotate-3">
              VA
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-black tracking-tighter text-[var(--text-heading)] leading-none">VORA</span>
              <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest mt-0.5">Assist</span>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="lg:hidden p-2 text-[var(--text-main)] hover:text-[var(--text-heading)] transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        <nav className="space-y-1 mb-6 flex-shrink-0">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-300 ${activeTab === item.id
                  ? 'bg-[var(--bg-card)] text-[var(--text-heading)] border border-[var(--border-muted)] shadow-xl'
                  : 'text-[var(--text-main)] hover:text-[var(--text-heading)] hover:bg-[var(--bg-card)]/30'
                }`}
            >
              <div className={`transition-colors ${activeTab === item.id ? 'text-blue-500' : ''}`}>
                {item.icon}
              </div>
              <span className="text-sm font-black tracking-tight">{item.label}</span>
            </button>
          ))}
        </nav>

        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <button
              onClick={onNewChat}
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white transition-all text-[11px] font-black uppercase tracking-widest mb-6 flex-shrink-0 shadow-lg shadow-blue-600/10 active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              New Chat
            </button>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              <label className="text-[9px] font-black text-[var(--text-main)]/50 uppercase tracking-[0.2em] px-4 block mb-2">History</label>
              {safeSessions.length === 0 ? (
                <div className="px-4 py-8 text-center border-2 border-dashed border-[var(--border-muted)] rounded-2xl">
                  <p className="text-[10px] text-[var(--text-main)]/40 font-bold uppercase tracking-widest">No Chats Yet</p>
                </div>
              ) : (
                safeSessions.map(session => (
                  <div key={session.id} className="group relative">
                    <button
                      onClick={() => onSelectSession(session.id)}
                      className={`w-full text-left px-4 py-3 rounded-2xl transition-all group ${currentChatId === session.id
                          ? 'bg-[var(--bg-card)]/50 border border-[var(--border-muted)] text-blue-500'
                          : 'text-[var(--text-main)] hover:bg-[var(--bg-card)]/20 hover:text-[var(--text-heading)]'
                        }`}
                    >
                      <div className="text-xs font-bold truncate pr-6">{session.title || 'Untitled Chat'}</div>
                      <div className="text-[8px] opacity-60 font-black uppercase tracking-tighter mt-1">
                        {session.updatedAt ? new Date(session.updatedAt).toLocaleDateString() : 'Recent'}
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-[var(--text-main)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="mt-auto space-y-4 pt-6 flex-shrink-0">
          <div className="flex items-center justify-between px-4">
            <label className="text-[10px] font-black text-[var(--text-main)]/50 uppercase tracking-[0.25em]">Brain Config</label>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-muted)] text-[var(--text-main)] hover:text-[var(--text-heading)] transition-all shadow-sm active:scale-95"
              title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {theme === 'dark' ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              )}
            </button>
          </div>

          <div className="bg-[var(--bg-card)] p-1.5 rounded-2xl border border-[var(--border-muted)] flex flex-col gap-1.5 shadow-inner transition-colors duration-300">
            <div className="flex gap-1.5">
              <button
                onClick={() => setProvider('gemini')}
                className={`flex-1 py-2 rounded-xl text-[10px] font-black transition-all ${provider === 'gemini' ? 'bg-[var(--bg-sidebar)] text-blue-500 shadow-md ring-1 ring-white/5' : 'text-[var(--text-main)] hover:text-[var(--text-heading)]'}`}
              >
                Gemini
              </button>
              <button
                onClick={() => setProvider('groq')}
                className={`flex-1 py-2 rounded-xl text-[10px] font-black transition-all ${provider === 'groq' ? 'bg-[var(--bg-sidebar)] text-orange-500 shadow-md ring-1 ring-white/5' : 'text-[var(--text-main)] hover:text-[var(--text-heading)]'}`}
              >
                Groq
              </button>
            </div>

            {provider === 'groq' && (
              <div className="flex flex-col gap-1 px-1 pb-1 animate-fade-in">
                <div className="h-px bg-[var(--border-muted)] my-1 mx-2" />
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setGroqModel('llama-3.3-70b-versatile')}
                    className={`flex-1 py-1.5 rounded-lg text-[8px] font-black transition-all uppercase tracking-widest ${groqModel === 'llama-3.3-70b-versatile' ? 'text-[var(--text-heading)] bg-[var(--bg-sidebar)] ring-1 ring-[var(--border-muted)]' : 'text-[var(--text-main)]'}`}
                  >
                    Llama 3.3
                  </button>
                  <button
                    onClick={() => setGroqModel('openai/gpt-oss-120b')}
                    className={`flex-1 py-1.5 rounded-lg text-[8px] font-black transition-all uppercase tracking-widest ${groqModel === 'openai/gpt-oss-120b' ? 'text-purple-500 bg-[var(--bg-sidebar)] ring-1 ring-purple-500/20' : 'text-[var(--text-main)]'}`}
                  >
                    GPT OSS
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
