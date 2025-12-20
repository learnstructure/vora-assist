
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import KnowledgeBase from './components/KnowledgeBase';
import ProfileEditor from './components/ProfileEditor';
import { UserProfile, Document, Message, DocumentChunk, AIProvider } from './types';
import { storageService } from './services/storageService';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'chat' | 'knowledge' | 'profile'>('chat');
  const [profile, setProfile] = useState<UserProfile>(storageService.getProfile());
  const [documents, setDocuments] = useState<Document[]>([]);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [provider, setProvider] = useState<AIProvider>(
    (localStorage.getItem('pi_provider') as AIProvider) || 'gemini'
  );

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      const [docs, storedChunks, chatHistory] = await Promise.all([
        storageService.getDocuments(),
        storageService.getChunks(),
        storageService.getChat()
      ]);
      setDocuments(docs);
      setChunks(storedChunks);
      setMessages(chatHistory);
    };
    loadData();
  }, []);

  // Sync messages and provider to storage
  useEffect(() => {
    if (messages.length > 0) {
      storageService.saveChat(messages);
    }
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('pi_provider', provider);
  }, [provider]);

  const handleTabChange = (tab: 'chat' | 'knowledge' | 'profile') => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-200 overflow-hidden relative">
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className={`
        fixed inset-y-0 left-0 z-50 transform lg:relative lg:translate-x-0 sidebar-transition
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        w-72 lg:w-64
      `}>
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={handleTabChange} 
          provider={provider}
          setProvider={setProvider}
          onClose={() => setIsSidebarOpen(false)}
        />
      </div>
      
      <main className="flex-1 h-full overflow-hidden flex flex-col min-w-0">
        {activeTab === 'chat' && (
          <ChatInterface 
            messages={messages} 
            setMessages={setMessages} 
            profile={profile}
            documents={documents}
            cachedChunks={chunks}
            provider={provider}
            toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          />
        )}
        
        {activeTab === 'knowledge' && (
          <div className="flex-1 flex flex-col min-w-0 h-full">
             <div className="lg:hidden h-14 border-b border-zinc-800 flex items-center px-4 bg-zinc-950/80 backdrop-blur-md">
                <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-zinc-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
                <span className="ml-2 font-bold text-sm text-zinc-200 uppercase tracking-widest">Memory Bank</span>
             </div>
             <KnowledgeBase 
              documents={documents}
              setDocuments={setDocuments}
              setChunks={setChunks}
            />
          </div>
        )}
        
        {activeTab === 'profile' && (
           <div className="flex-1 flex flex-col min-w-0 h-full">
            <div className="lg:hidden h-14 border-b border-zinc-800 flex items-center px-4 bg-zinc-950/80 backdrop-blur-md">
              <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-zinc-400">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <span className="ml-2 font-bold text-sm text-zinc-200 uppercase tracking-widest">Persona</span>
            </div>
            <ProfileEditor 
              profile={profile}
              setProfile={setProfile}
            />
          </div>
        )}
      </main>

      {!process.env.API_KEY && (
        <div className="fixed bottom-4 right-4 z-[60]">
          <div className="bg-red-950/80 border border-red-500/30 backdrop-blur-xl px-4 py-2 rounded-xl text-[10px] text-red-200 flex items-center gap-2 shadow-2xl">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
            PI OFFLINE (API KEY REQ)
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
