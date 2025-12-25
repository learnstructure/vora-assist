
import { UserProfile, Message, DocumentChunk, GroqModel, AIResponse } from '../types';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export const groqService = {
  askGroq: async (
    query: string,
    history: Message[],
    profile: UserProfile,
    relevantChunks: DocumentChunk[],
    allDocTitles: string[] = [],
    model: GroqModel = 'llama-3.3-70b-versatile'
  ): Promise<AIResponse> => {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      throw new Error("Groq API Key is missing. Please set GROQ_API_KEY.");
    }

    const systemInstruction = `
      You are VORA Assist, an Intelligent Partner running on the Groq LPU engine.
      
      ### CORE IDENTITY
      User Name: ${profile.name || 'Kaelen Voss'}
      Role: ${profile.role || 'User'}
      BIO, GOALS & MISSION: ${profile.bio || 'General Support'}
      Technical Stack: ${profile.technicalStack.join(', ')}

      ### OPERATIONAL DIRECTIVE
      Focus on long-term goals. Use the provided conversation history to ensure you never repeat yourself and build on previous context.

      ### MEMORY BANK (PRIVATE LIBRARY)
      Library Index: ${allDocTitles.length > 0 ? allDocTitles.join(', ') : 'No documents uploaded yet.'}

      ### RETRIEVED SNIPPETS
      ${relevantChunks.length > 0
        ? relevantChunks.map(c => `[Source: ${c.docTitle}]: ${c.text}`).join('\n\n')
        : 'No specific local document matches.'
      }
    `;

    const messages = [
      { role: 'system', content: systemInstruction },
      ...history.slice(-12).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
      })),
      { role: 'user', content: query }
    ];

    try {
      const response = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages,
          stream: false,
          temperature: model === 'openai/gpt-oss-120b' ? 0.4 : 0.6,
          max_tokens: 4096
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `Groq API Error: ${response.statusText}`);
      }

      const data = await response.json();
      const text = data.choices[0].message.content;
      const sources = Array.from(new Set(relevantChunks.map(c => c.docTitle)));

      return { text, sources, groundingSources: undefined };
    } catch (error) {
      console.error("Groq Service Error:", error);
      throw error;
    }
  }
};
