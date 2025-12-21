
import React from 'react';
import { AIProvider, ChatSession } from '../types';

interface SidebarProps {
  activeTab: 'chat' | 'knowledge' | 'profile';
  setActiveTab: (tab: 'chat' | 'knowledge' | 'profile') => void;
  provider: AIProvider;
  setProvider: (p: AIProvider) => void;
  onClose?: () => void;
  sessions: ChatSession[];
  currentChatId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  provider,
  setProvider,
  onClose,
  sessions = [],
  currentChatId,
  onSelectSession,
  onNewChat,
  onDeleteSession
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
    <div className="flex flex-col h-full bg-zinc-900 lg:bg-[#09090b] border-r border-zinc-800 shadow-2xl lg:shadow-none">
      <div className="p-6 flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center justify-between mb-8 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 via-blue-500 to-cyan-400 flex items-center justify-center font-black text-white text-base shadow-2xl shadow-blue-500/20 ring-1 ring-white/10">
              VA
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-black tracking-tighter text-white leading-none">VORA</span>
              <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest mt-0.5">Assist</span>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="lg:hidden p-2 text-zinc-500 hover:text-white transition-colors">
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
                  ? 'bg-zinc-800 text-white border border-zinc-700 shadow-xl'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
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
            {/* Fix: use onNewChat prop instead of undefined handleNewChat */}
            <button
              onClick={onNewChat}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white transition-all text-[11px] font-black uppercase tracking-widest mb-6 flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              New Chat
            </button>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              <label className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] px-4 block mb-2">History</label>
              {safeSessions.length === 0 ? (
                <div className="px-4 py-8 text-center border-2 border-dashed border-zinc-800 rounded-2xl">
                  <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">No Chats Yet</p>
                </div>
              ) : (
                safeSessions.map(session => (
                  <div key={session.id} className="group relative">
                    <button
                      onClick={() => onSelectSession(session.id)}
                      className={`w-full text-left px-4 py-3 rounded-2xl transition-all group ${currentChatId === session.id
                          ? 'bg-zinc-800/50 border border-zinc-700/50 text-blue-400'
                          : 'text-zinc-500 hover:bg-zinc-800/20 hover:text-zinc-300'
                        }`}
                    >
                      <div className="text-xs font-bold truncate pr-6">{session.title || 'Untitled Chat'}</div>
                      <div className="text-[8px] text-zinc-600 font-black uppercase tracking-tighter mt-1">
                        {session.updatedAt ? new Date(session.updatedAt).toLocaleDateString() : 'Recent'}
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-zinc-700 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
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
          <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.25em] px-4">Brain Config</label>
          <div className="bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800 flex gap-1.5">
            <button
              onClick={() => setProvider('gemini')}
              className={`flex-1 py-2 rounded-xl text-[10px] font-black transition-all ${provider === 'gemini' ? 'bg-zinc-800 text-blue-400 shadow-inner' : 'text-zinc-600 hover:text-zinc-500'}`}
            >
              Gemini
            </button>
            <button
              onClick={() => setProvider('groq')}
              className={`flex-1 py-2 rounded-xl text-[10px] font-black transition-all ${provider === 'groq' ? 'bg-zinc-800 text-orange-400 shadow-inner' : 'text-zinc-600 hover:text-zinc-500'}`}
            >
              Groq
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
