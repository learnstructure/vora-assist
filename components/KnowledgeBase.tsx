
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
  const [useVision, setUseVision] = useState(false);

  const chunkMarkdown = (text: string): string[] => {
    const sections = text.split(/(?=^#{1,3}\s)/m);
    const result: string[] = [];

    sections.forEach(section => {
      if (section.length < 1500) {
        if (section.trim()) result.push(section.trim());
      } else {
        const paras = section.split(/\n\n+/);
        let currentChunk = "";
        paras.forEach(para => {
          if ((currentChunk.length + para.length) > 1500) {
            if (currentChunk) result.push(currentChunk.trim());
            currentChunk = para;
          } else {
            currentChunk += (currentChunk ? "\n\n" : "") + para;
          }
        });
        if (currentChunk) result.push(currentChunk.trim());
      }
    });

    return result;
  };

  const extractTextStandardPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      setProgress(`Fast-Scanning PDF Page ${i}/${pdf.numPages}...`);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += `## Page ${i}\n\n${pageText}\n\n`;
    }
    return fullText;
  };

  const extractTextMultimodal = async (file: File): Promise<string> => {
    if (file.type === 'application/pdf') {
      if (!useVision) {
        return await extractTextStandardPDF(file);
      }

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      let fullMarkdown = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        setProgress(`Vision Parsing Page ${i}/${pdf.numPages}...`);
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Fix: Removed 'canvas' from parameters as it is not part of the standard RenderParameters type
        await page.render({ canvasContext: context!, viewport }).promise;
        const base64Image = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];

        const pageMarkdown = await geminiService.processPageWithVision(base64Image);
        fullMarkdown += pageMarkdown + '\n\n';
      }
      return fullMarkdown;
    }

    if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      setProgress(`Parsing Word Document...`);
      const arrayBuffer = await file.arrayBuffer();
      // Fix: Cast mammoth to any to bypass strict type checking for property access in ESM
      const result = await (mammoth as any).convertToMarkdown({ arrayBuffer });
      return result.value;
    }

    setProgress(`Reading Text Data...`);
    return await file.text();
  };

  const processFiles = async (files: FileList | File[]) => {
    setIsProcessing(true);
    for (const file of Array.from(files)) {
      try {
        setProgress(`Initializing ${file.name}...`);
        const content = await extractTextMultimodal(file);

        const docId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
        let docType: any = 'text';
        if (file.name.endsWith('.pdf')) docType = 'pdf';
        else if (file.name.endsWith('.docx')) docType = 'docx';
        else if (file.name.endsWith('.md')) docType = 'markdown';
        else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) docType = 'html';
        else if (['.py', '.js', '.ts', '.tsx', '.json', '.css'].some(ext => file.name.endsWith(ext))) docType = 'code';

        const newDoc: Document = {
          id: docId,
          title: file.name,
          content: content,
          type: docType,
          category: 'General',
          tags: [],
          createdAt: Date.now(),
        };

        setProgress(`Chunking Memory for ${file.name}...`);
        const textChunks = chunkMarkdown(content);
        const chunkObjects: DocumentChunk[] = [];

        for (let i = 0; i < textChunks.length; i++) {
          setProgress(`Embedding ${file.name} (${i + 1}/${textChunks.length})...`);
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl lg:text-4xl font-black text-[var(--text-heading)] tracking-tighter mb-2 uppercase italic">Memory Bank</h1>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${useVision ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}`}></span>
            <p className="text-[var(--text-main)] text-sm font-medium opacity-70">
              {useVision ? 'Vision AI: High-Fidelity PDF Parsing' : 'Standard Speed: Optimized for Text/Code'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-muted)] shadow-sm">
            <div className="flex flex-col items-end mr-1">
              <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-main)]">PDF Vision</span>
              <span className={`text-[7px] font-bold uppercase transition-colors ${useVision ? 'text-blue-500' : 'text-[var(--text-main)] opacity-40'}`}>
                {useVision ? 'Enabled' : 'Bypassed'}
              </span>
            </div>
            <button
              onClick={() => setUseVision(!useVision)}
              className={`relative w-10 h-5 rounded-full transition-all duration-300 flex items-center ${useVision ? 'bg-blue-600' : 'bg-[var(--border-muted)]'}`}
              title="Only applies to PDF files. Standard text and Word docs always use high-speed parsing."
            >
              <div className={`absolute w-3.5 h-3.5 rounded-full bg-white transition-all duration-300 shadow-md ${useVision ? 'left-[22px]' : 'left-[4px]'}`}></div>
            </button>
          </div>

          <label className={`flex-1 sm:flex-none text-center cursor-pointer bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-2xl text-[11px] font-black tracking-widest uppercase transition-all shadow-xl active:scale-95 ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
            {isProcessing ? 'Syncing...' : 'Upload Data'}
            <input
              type="file"
              className="hidden"
              accept=".txt,.md,.pdf,.docx,.html,.htm,.py,.js,.ts,.tsx,.json,.css"
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
            <p className="text-2xl font-black text-[var(--text-heading)] uppercase tracking-tighter">Drop to index memory</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-24">
        {documents.length === 0 ? (
          <div className="col-span-full py-40 border-2 border-dashed border-[var(--border-muted)] rounded-[3rem] flex flex-col items-center justify-center text-[var(--text-main)] group hover:border-blue-500/30 transition-all">
            <div className="w-24 h-24 rounded-full bg-[var(--bg-card)]/50 flex items-center justify-center mb-8 border border-[var(--border-muted)] group-hover:scale-110 group-hover:bg-blue-900/10 transition-all duration-500">
              <svg className="w-10 h-10 opacity-20 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            </div>
            <p className="text-xl font-black text-[var(--text-heading)] opacity-40 tracking-tight uppercase">Empty Memory Bank</p>
            <p className="text-sm mt-3 text-[var(--text-main)] px-10 text-center font-medium max-w-sm leading-relaxed opacity-60">
              Standard parsing for text, code, and simple docs is near-instant. <b>PDF Vision</b> is an optional toggle for complex research layouts.
            </p>
          </div>
        ) : (
          documents.map(doc => (
            <div key={doc.id} className="bg-[var(--bg-card)] border border-[var(--border-muted)] rounded-[2rem] p-7 hover:border-blue-500/30 transition-all group relative overflow-hidden shadow-sm">
              <div className="flex items-start justify-between mb-8">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${doc.type === 'pdf' ? 'bg-red-500/10 text-red-500' :
                  doc.type === 'docx' ? 'bg-blue-500/10 text-blue-500' :
                    doc.type === 'code' ? 'bg-emerald-500/10 text-emerald-500' :
                      'bg-[var(--bg-sidebar)] text-[var(--text-main)]'
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
