
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import KnowledgeBase from './components/KnowledgeBase';
import ProfileEditor from './components/ProfileEditor';
import { UserProfile, Document, Message, DocumentChunk, AIProvider, ChatSession, GroqModel } from './types';
import { storageService } from './services/storageService';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'chat' | 'knowledge' | 'profile'>('chat');
  const [profile, setProfile] = useState<UserProfile>(storageService.getProfile());
  const [documents, setDocuments] = useState<Document[]>([]);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(localStorage.getItem('vora_active_chat'));
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [provider, setProvider] = useState<AIProvider>(
    (localStorage.getItem('vora_provider') as AIProvider) || 'groq'
  );

  const [groqModel, setGroqModel] = useState<GroqModel>(
    (localStorage.getItem('vora_groq_model') as GroqModel) || 'llama-3.3-70b-versatile'
  );

  // Initial load with defensive checks
  useEffect(() => {
    const loadData = async () => {
      try {
        const [docs, storedChunks, storedSessions] = await Promise.all([
          storageService.getDocuments(),
          storageService.getChunks(),
          storageService.getChatSessions()
        ]);

        // Filter out malformed sessions to prevent UI crashes
        const validSessions = (storedSessions || []).filter(s => s && s.id && Array.isArray(s.messages));

        setDocuments(docs || []);
        setChunks(storedChunks || []);
        setSessions(validSessions);

        // Load specific chat if ID exists and is valid
        if (currentChatId) {
          const session = await storageService.getChatSession(currentChatId);
          if (session && Array.isArray(session.messages)) {
            setMessages(session.messages);
          } else {
            console.warn("Session invalid or missing, resetting active chat");
            setCurrentChatId(null);
            setMessages([]);
            localStorage.removeItem('vora_active_chat');
          }
        }
      } catch (error) {
        console.error("Critical error loading local data:", error);
        setSessions([]);
        setMessages([]);
      }
    };
    loadData();
  }, []);

  // Sync messages of active chat to storage
  useEffect(() => {
    if (currentChatId && messages.length > 0) {
      const activeSessionSnippet = sessions.find(s => s.id === currentChatId);
      const title = activeSessionSnippet?.title || messages[0].content.slice(0, 30) + '...';

      const updatedSession: ChatSession = {
        id: currentChatId,
        title,
        messages,
        updatedAt: Date.now()
      };

      storageService.saveChatSession(updatedSession).then(() => {
        storageService.getChatSessions().then(fetched => {
          const valid = (fetched || []).filter(s => s && s.id);
          setSessions(valid);
        });
      }).catch(err => console.error("Failed to save session:", err));
    }
  }, [messages, currentChatId]);

  useEffect(() => {
    localStorage.setItem('vora_provider', provider);
  }, [provider]);

  useEffect(() => {
    localStorage.setItem('vora_groq_model', groqModel);
  }, [groqModel]);

  useEffect(() => {
    if (currentChatId) {
      localStorage.setItem('vora_active_chat', currentChatId);
    } else {
      localStorage.removeItem('vora_active_chat');
    }
  }, [currentChatId]);

  const handleNewChat = () => {
    setCurrentChatId(null);
    setMessages([]);
    setActiveTab('chat');
    setIsSidebarOpen(false);
  };

  const handleSelectSession = async (id: string) => {
    try {
      const session = await storageService.getChatSession(id);
      if (session && Array.isArray(session.messages)) {
        setCurrentChatId(id);
        setMessages(session.messages);
      } else {
        alert("This conversation data is corrupted or missing.");
        handleDeleteSession(id);
      }
    } catch (err) {
      console.error("Error selecting session:", err);
    }
    setActiveTab('chat');
    setIsSidebarOpen(false);
  };

  const handleDeleteSession = async (id: string) => {
    if (confirm("Delete this conversation?")) {
      await storageService.deleteChatSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (currentChatId === id) {
        handleNewChat();
      }
    }
  };

  const handleFirstMessageSent = (firstMsg: Message) => {
    const newId = Date.now().toString();
    const newSession: ChatSession = {
      id: newId,
      title: firstMsg.content.slice(0, 30) + '...',
      messages: [firstMsg],
      updatedAt: Date.now()
    };
    setCurrentChatId(newId);
    setMessages([firstMsg]);
    storageService.saveChatSession(newSession).then(() => {
      storageService.getChatSessions().then(setSessions);
    });
  };

  const isGeminiMissing = () => !process.env.API_KEY;
  const isChatProviderMissing = () => {
    if (provider === 'gemini') return isGeminiMissing();
    if (provider === 'groq') return !process.env.GROQ_API_KEY;
    return false;
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
          setActiveTab={setActiveTab}
          provider={provider}
          setProvider={setProvider}
          groqModel={groqModel}
          setGroqModel={setGroqModel}
          onClose={() => setIsSidebarOpen(false)}
          sessions={sessions}
          currentChatId={currentChatId}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          onDeleteSession={handleDeleteSession}
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
            groqModel={groqModel}
            toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            currentChatId={currentChatId}
            onFirstMessage={handleFirstMessageSent}
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
              provider={provider}
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

      <div className="fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2">
        {isGeminiMissing() && (
          <div className="bg-blue-950/80 border border-blue-500/30 backdrop-blur-xl px-4 py-2 rounded-xl text-[10px] text-blue-200 flex items-center gap-2 shadow-2xl">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            GEMINI REQ FOR MEMORY
          </div>
        )}
        {isChatProviderMissing() && (
          <div className="bg-red-950/80 border border-red-500/30 backdrop-blur-xl px-4 py-2 rounded-xl text-[10px] text-red-200 flex items-center gap-2 shadow-2xl">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
            {provider.toUpperCase()} CHAT OFFLINE
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
