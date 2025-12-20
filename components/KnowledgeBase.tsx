
import React, { useState } from 'react';
import { Document, DocumentChunk, AIProvider } from '../types';
import { storageService } from '../services/storageService';
import { geminiService } from '../services/geminiService';
import * as pdfjs from 'pdfjs-dist';
import mammoth from 'mammoth';

// Initialize PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.10.38/build/pdf.worker.mjs`;

interface KnowledgeBaseProps {
  documents: Document[];
  setDocuments: React.Dispatch<React.SetStateAction<Document[]>>;
  setChunks: React.Dispatch<React.SetStateAction<DocumentChunk[]>>;
  provider: AIProvider;
}

const KnowledgeBase: React.FC<KnowledgeBaseProps> = ({ documents, setDocuments, setChunks, provider }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');

  const chunkText = (text: string, size = 1000, overlap = 200): string[] => {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      chunks.push(text.slice(start, start + size));
      start += size - overlap;
    }
    return chunks;
  };

  const extractText = async (file: File): Promise<string> => {
    if (file.type === 'application/pdf') {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
      }
      return fullText;
    } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    } else {
      return await file.text();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);

    for (const file of Array.from(files) as File[]) {
      try {
        setProgress(`Extracting ${file.name}...`);
        const text = await extractText(file);

        const docId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
        const newDoc: Document = {
          id: docId,
          title: file.name,
          content: text,
          type: file.name.endsWith('.pdf') ? 'pdf' : file.name.endsWith('.docx') ? 'docx' : 'text',
          category: 'General',
          tags: [],
          createdAt: Date.now(),
        };

        // CONSISTENTLY use Gemini for embeddings (Brain indexing)
        setProgress(`Vectorizing ${file.name} via Gemini...`);
        const textChunks = chunkText(text);
        const chunkObjects: DocumentChunk[] = [];

        for (let i = 0; i < textChunks.length; i++) {
          setProgress(`Indexing ${file.name} (Part ${i + 1}/${textChunks.length})...`);

          const embedding = await geminiService.getEmbedding(textChunks[i]);

          chunkObjects.push({
            id: `${docId}-chunk-${i}`,
            docId,
            docTitle: file.name,
            text: textChunks[i],
            embedding
          });
        }

        await storageService.saveDocument(newDoc, chunkObjects);
        setDocuments(prev => [newDoc, ...prev]);
        setChunks(prev => [...prev, ...chunkObjects]);
      } catch (err: any) {
        console.error("Error processing file:", err);
        alert(`Failed to process ${file.name}: ${err.message}. Ensure your Gemini API_KEY is set correctly.`);
      }
    }

    setIsProcessing(false);
    setProgress('');
    e.target.value = '';
  };

  const deleteDoc = async (id: string) => {
    if (confirm("Permanently delete this document from memory?")) {
      try {
        await storageService.deleteDocument(id);
        setDocuments(prev => prev.filter(d => d.id !== id));
        setChunks(prev => prev.filter(c => c.docId !== id));
      } catch (err) {
        console.error("Deletion failed:", err);
      }
    }
  };

  const wipeMemory = async () => {
    if (confirm("Wipe all documents?")) {
      try {
        setIsProcessing(true);
        setProgress('Wiping Memory...');
        for (const doc of documents) {
          await storageService.deleteDocument(doc.id);
        }
        setDocuments([]);
        setChunks([]);
      } catch (err) {
        console.error("Wipe failed:", err);
      } finally {
        setIsProcessing(false);
        setProgress('');
      }
    }
  };

  return (
    <div className="p-5 lg:p-10 h-full overflow-y-auto max-w-7xl mx-auto flex flex-col">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10">
        <div>
          <h1 className="text-3xl lg:text-4xl font-black text-white tracking-tighter mb-2 uppercase">Memory Bank</h1>
          <p className="text-zinc-500 text-sm font-medium">Indexing powered by Gemini • Chatting via {provider.toUpperCase()}.</p>
        </div>

        <div className="flex gap-3 w-full sm:w-auto">
          {documents.length > 0 && (
            <button
              onClick={wipeMemory}
              className="px-6 py-3 rounded-2xl text-[11px] font-black tracking-widest uppercase border border-red-900/50 text-red-500 hover:bg-red-500/5 transition-all"
            >
              Wipe Bank
            </button>
          )}
          <label className={`flex-1 sm:flex-none text-center cursor-pointer bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-2xl text-[11px] font-black tracking-widest uppercase transition-all shadow-xl active:scale-95 ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
            {isProcessing ? 'Indexing...' : 'Upload Data'}
            <input
              type="file"
              className="hidden"
              accept=".txt,.md,.pdf,.docx"
              multiple
              onChange={handleFileUpload}
              disabled={isProcessing}
            />
          </label>
        </div>
      </div>

      {isProcessing && (
        <div className="mb-8 p-6 border rounded-[1.5rem] flex items-center gap-4 animate-pulse bg-blue-950/20 border-blue-500/20 text-blue-300">
          <div className="w-6 h-6 border-3 rounded-full animate-spin border-blue-500 border-t-transparent"></div>
          <span className="text-[11px] font-black tracking-widest uppercase">{progress}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-24">
        {documents.length === 0 ? (
          <div className="col-span-full py-40 border-2 border-dashed border-zinc-800 rounded-[3rem] flex flex-col items-center justify-center text-zinc-600 group">
            <div className="w-24 h-24 rounded-full bg-zinc-900 flex items-center justify-center mb-8 border border-zinc-800 group-hover:scale-110 transition-transform duration-500">
              <svg className="w-10 h-10 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            </div>
            <p className="text-xl font-black text-zinc-400 tracking-tight">Memory is Empty</p>
            <p className="text-sm mt-3 text-zinc-600 px-10 text-center font-medium max-w-sm leading-relaxed">
              Upload documents. PI uses Gemini to index them for cross-model context-aware chat.
            </p>
          </div>
        ) : (
          documents.map(doc => (
            <div key={doc.id} className="bg-zinc-900 border border-zinc-800/80 rounded-[2rem] p-7 hover:bg-zinc-900/80 hover:border-zinc-700 transition-all group relative overflow-hidden">
              <div className="flex items-start justify-between mb-8">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${doc.type === 'pdf' ? 'bg-red-500/10 text-red-500' :
                    doc.type === 'docx' ? 'bg-blue-500/10 text-blue-500' : 'bg-zinc-800/50 text-zinc-400'
                  }`}>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteDoc(doc.id);
                  }}
                  className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 text-zinc-500 hover:text-red-500 hover:border-red-500/30 transition-all relative z-30"
                  title="Delete from memory"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>

              <div className="space-y-2">
                <h3 className="font-black text-zinc-100 truncate text-lg" title={doc.title}>{doc.title}</h3>
                <p className="text-xs text-zinc-500 line-clamp-2 font-medium leading-relaxed mb-6">
                  {doc.content.substring(0, 180)}...
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-zinc-800/50 pt-6 mt-6">
                <div className="flex gap-2">
                  <span className="text-[8px] px-2 py-0.5 rounded-lg bg-zinc-950 text-zinc-400 font-black tracking-widest uppercase border border-zinc-800">{doc.type}</span>
                </div>
                <span className="text-[10px] text-zinc-600 font-black uppercase tracking-tight">
                  {new Date(doc.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default KnowledgeBase;
