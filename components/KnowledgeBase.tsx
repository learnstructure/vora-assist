
import React, { useState, useCallback } from 'react';
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
  const [isDragging, setIsDragging] = useState(false);
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
    } else if (file.type === 'text/html' || file.name.endsWith('.html') || file.name.endsWith('.htm')) {
      const html = await file.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return doc.body.innerText || doc.documentElement.innerText || "";
    } else {
      return await file.text();
    }
  };

  const processFiles = async (files: FileList | File[]) => {
    setIsProcessing(true);
    for (const file of Array.from(files)) {
      try {
        setProgress(`Extracting ${file.name}...`);
        const text = await extractText(file);

        const docId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
        let docType: any = 'text';
        if (file.name.endsWith('.pdf')) docType = 'pdf';
        else if (file.name.endsWith('.docx')) docType = 'docx';
        else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) docType = 'html';

        const newDoc: Document = {
          id: docId,
          title: file.name,
          content: text,
          type: docType,
          category: 'General',
          tags: [],
          createdAt: Date.now(),
        };

        setProgress(`Vectorizing ${file.name} via Gemini...`);
        const textChunks = chunkText(text);
        const chunkObjects: DocumentChunk[] = [];

        for (let i = 0; i < textChunks.length; i++) {
          setProgress(`Indexing ${file.name} (${i + 1}/${textChunks.length})...`);
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
        alert(`Failed to process ${file.name}: ${err.message}.`);
      }
    }
    setIsProcessing(false);
    setProgress('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
    e.target.value = '';
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) processFiles(e.dataTransfer.files);
  }, []);

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

  return (
    <div
      className={`p-5 lg:p-10 h-full overflow-y-auto max-w-7xl mx-auto flex flex-col transition-all duration-300 ${isDragging ? 'bg-blue-600/5' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10">
        <div>
          <h1 className="text-3xl lg:text-4xl font-black text-[var(--text-heading)] tracking-tighter mb-2 uppercase italic">Memory Bank</h1>
          <p className="text-[var(--text-main)] text-sm font-medium opacity-70">Embeddings via Gemini • {provider.toUpperCase()} Logic.</p>
        </div>

        <div className="flex gap-3 w-full sm:w-auto">
          <label className={`flex-1 sm:flex-none text-center cursor-pointer bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-2xl text-[11px] font-black tracking-widest uppercase transition-all shadow-xl active:scale-95 ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
            {isProcessing ? 'Indexing...' : 'Upload Data'}
            <input
              type="file"
              className="hidden"
              accept=".txt,.md,.pdf,.docx,.html,.htm"
              multiple
              onChange={handleFileUpload}
              disabled={isProcessing}
            />
          </label>
        </div>
      </div>

      {isProcessing && (
        <div className="mb-8 p-6 border rounded-[1.5rem] flex items-center gap-4 animate-pulse bg-blue-900/10 border-blue-500/20 text-blue-500">
          <div className="w-6 h-6 border-2 rounded-full animate-spin border-blue-500 border-t-transparent"></div>
          <span className="text-[11px] font-black tracking-widest uppercase">{progress}</span>
        </div>
      )}

      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-600/10 backdrop-blur-sm pointer-events-none">
          <div className="bg-[var(--bg-card)] border-2 border-dashed border-blue-500 p-20 rounded-[4rem] shadow-2xl flex flex-col items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-white">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            </div>
            <p className="text-2xl font-black text-[var(--text-heading)] uppercase tracking-tighter">Drop to index files</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-24">
        {documents.length === 0 ? (
          <div className="col-span-full py-40 border-2 border-dashed border-[var(--border-muted)] rounded-[3rem] flex flex-col items-center justify-center text-[var(--text-main)] group hover:border-blue-500/30 transition-all">
            <div className="w-24 h-24 rounded-full bg-[var(--bg-card)]/50 flex items-center justify-center mb-8 border border-[var(--border-muted)] group-hover:scale-110 group-hover:bg-blue-900/10 transition-all duration-500">
              <svg className="w-10 h-10 opacity-20 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            </div>
            <p className="text-xl font-black text-[var(--text-heading)] opacity-40 tracking-tight uppercase">Memory is Empty</p>
            <p className="text-sm mt-3 text-[var(--text-main)] px-10 text-center font-medium max-w-sm leading-relaxed opacity-60">
              Drag and drop files here or click Upload to index your private documents.
            </p>
          </div>
        ) : (
          documents.map(doc => (
            <div key={doc.id} className="bg-[var(--bg-card)] border border-[var(--border-muted)] rounded-[2rem] p-7 hover:border-blue-500/30 transition-all group relative overflow-hidden shadow-sm">
              <div className="flex items-start justify-between mb-8">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${doc.type === 'pdf' ? 'bg-red-500/10 text-red-500' :
                    doc.type === 'docx' ? 'bg-blue-500/10 text-blue-500' :
                      doc.type === 'html' ? 'bg-orange-500/10 text-orange-500' : 'bg-[var(--bg-sidebar)] text-[var(--text-main)]'
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
                  className="p-3 rounded-2xl bg-[var(--bg-deep)] border border-[var(--border-muted)] text-[var(--text-main)] hover:text-red-500 hover:border-red-500/30 transition-all relative z-30"
                  title="Delete from memory"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>

              <div className="space-y-2">
                <h3 className="font-black text-[var(--text-heading)] truncate text-lg" title={doc.title}>{doc.title}</h3>
                <p className="text-xs text-[var(--text-main)] line-clamp-2 font-medium leading-relaxed mb-6 opacity-80">
                  {doc.content.substring(0, 180)}...
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-[var(--border-muted)] pt-6 mt-6">
                <div className="flex gap-2">
                  <span className="text-[8px] px-2 py-0.5 rounded-lg bg-[var(--bg-sidebar)] text-[var(--text-main)] font-black tracking-widest uppercase border border-[var(--border-muted)]">{doc.type}</span>
                </div>
                <span className="text-[10px] text-[var(--text-main)] opacity-40 font-black uppercase tracking-tight">
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
