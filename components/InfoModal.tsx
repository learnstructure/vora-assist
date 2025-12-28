
import React from 'react';
import { AIProvider, GroqModel } from '../types';

interface InfoModalProps {
    isOpen: boolean;
    onClose: () => void;
    provider: AIProvider;
    setProvider: (p: AIProvider) => void;
    groqModel: GroqModel;
    setGroqModel: (m: GroqModel) => void;
}

const InfoModal: React.FC<InfoModalProps> = ({
    isOpen,
    onClose,
    provider,
    setProvider,
    groqModel,
    setGroqModel
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-md animate-fade-in"
                onClick={onClose}
            />

            <div className="relative w-full max-w-2xl bg-[var(--bg-card)] border border-[var(--border-muted)] rounded-[2.5rem] shadow-2xl overflow-hidden animate-scale-in flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-8 py-6 border-b border-[var(--border-muted)] flex items-center justify-between bg-[var(--bg-sidebar)]/30">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white text-xs font-black">?</div>
                        <h2 className="text-sm font-black text-[var(--text-heading)] uppercase tracking-widest">System Guide & Control</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-[var(--text-main)] hover:text-[var(--text-heading)] transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-10">
                    {/* Usage Section */}
                    <section className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em]">Quick Start Guide</h3>
                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                                <span className="w-1 h-1 rounded-full bg-green-500 animate-pulse"></span>
                                <span className="text-[8px] font-black text-green-500 uppercase">Privacy First</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {[
                                { step: '01', title: 'Memory Bank', desc: 'Upload PDFs, Docs, or HTML. Your files are indexed locally and never leave this browser.' },
                                { step: '02', title: 'Identity', desc: 'Update your Persona so VORA understands your goals and expertise.' },
                                { step: '03', title: 'Intelligence', desc: 'Chat and receive context-aware answers synced with your private memory.' },
                            ].map(item => (
                                <div key={item.step} className="p-5 rounded-2xl bg-[var(--bg-sidebar)]/50 border border-[var(--border-muted)] space-y-3">
                                    <span className="text-xl font-black text-blue-500 opacity-20">{item.step}</span>
                                    <h4 className="text-xs font-black text-[var(--text-heading)] uppercase">{item.title}</h4>
                                    <p className="text-[10px] text-[var(--text-main)] font-medium leading-relaxed">{item.desc}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Brain Config Section */}
                    <section className="space-y-6">
                        <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em]">Brain Configuration</h3>
                        <div className="bg-[var(--bg-sidebar)]/30 rounded-3xl p-6 border border-[var(--border-muted)]">
                            <div className="space-y-6">
                                <div className="flex flex-col gap-3">
                                    <label className="text-[10px] font-black text-[var(--text-main)]/60 uppercase px-1">AI Provider</label>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setProvider('gemini')}
                                            className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${provider === 'gemini' ? 'bg-blue-600 text-white shadow-lg' : 'bg-[var(--bg-card)] border border-[var(--border-muted)] text-[var(--text-main)] hover:text-[var(--text-heading)]'}`}
                                        >
                                            Gemini
                                        </button>
                                        <button
                                            onClick={() => setProvider('groq')}
                                            className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${provider === 'groq' ? 'bg-orange-600 text-white shadow-lg' : 'bg-[var(--bg-card)] border border-[var(--border-muted)] text-[var(--text-main)] hover:text-[var(--text-heading)]'}`}
                                        >
                                            Groq
                                        </button>
                                    </div>
                                </div>

                                {provider === 'groq' && (
                                    <div className="flex flex-col gap-3 animate-fade-in">
                                        <label className="text-[10px] font-black text-[var(--text-main)]/60 uppercase px-1">Groq Model Selection</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => setGroqModel('llama-3.3-70b-versatile')}
                                                className={`py-2.5 rounded-xl text-[10px] font-black transition-all ${groqModel === 'llama-3.3-70b-versatile' ? 'bg-[var(--bg-card)] border-blue-500 text-blue-500' : 'bg-[var(--bg-card)] border border-[var(--border-muted)] text-[var(--text-main)]'}`}
                                            >
                                                Llama 3.3 70B
                                            </button>
                                            <button
                                                onClick={() => setGroqModel('openai/gpt-oss-120b')}
                                                className={`py-2.5 rounded-xl text-[10px] font-black transition-all ${groqModel === 'openai/gpt-oss-120b' ? 'bg-[var(--bg-card)] border-purple-500 text-purple-500' : 'bg-[var(--bg-card)] border border-[var(--border-muted)] text-[var(--text-main)]'}`}
                                            >
                                                GPT OSS 120B
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* Credits Section */}
                    <section className="pt-6 border-t border-[var(--border-muted)]">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white font-black shadow-xl">AM</div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-[var(--text-main)] uppercase tracking-[0.2em] mb-1">Developed By</span>
                                    <h4 className="text-base font-black text-[var(--text-heading)] tracking-tighter">Abinash Mandal</h4>
                                </div>
                            </div>
                            <a
                                href="https://www.linkedin.com/in/abinash-mandal-90132b238/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#0077b5] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#005a8d] transition-all shadow-lg shadow-[#0077b5]/10 active:scale-95"
                            >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.761 0 5-2.239 5-5v-14c0-2.761-2.239-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" /></svg>
                                Connect on LinkedIn
                            </a>
                        </div>
                    </section>
                </div>

                {/* Footer */}
                <div className="px-8 py-4 bg-[var(--bg-sidebar)]/50 border-t border-[var(--border-muted)] flex justify-center">
                    <p className="text-[8px] font-black text-[var(--text-main)] uppercase tracking-[0.3em]">VORA Assist © 2026 • Local-First Intelligence</p>
                </div>
            </div>
        </div>
    );
};

export default InfoModal;
