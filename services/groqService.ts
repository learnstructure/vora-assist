
import { UserProfile, Message, DocumentChunk } from '../types';

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export const groqService = {
  askGroq: async (
    query: string,
    history: Message[],
    profile: UserProfile,
    relevantChunks: DocumentChunk[]
  ): Promise<{ text: string; sources: string[] }> => {
    // Standardizing on the environment API_KEY
    const apiKey = process.env.API_KEY;

    const systemInstruction = `
      You are VORA Assist, an Intelligent Partner running on the Groq LPU engine.
      
      ### PARTNER CONTEXT
      Name: ${profile.name || 'Anonymous'}
      Role: ${profile.role || 'User'}
      Tech Stack: ${profile.technicalStack.join(', ')}

      ### SEMANTIC CONTEXT (RAG)
      Use these snippets from the user's local memory to answer:
      ${relevantChunks.length > 0 
        ? relevantChunks.map(c => `[Source: ${c.docTitle}]: ${c.text}`).join('\n\n')
        : 'No local documents found. Use general knowledge.'
      }

      ### STYLE
      Be precise, fast, and helpful. Mention sources if used.
    `;

    const messages = [
      { role: 'system', content: systemInstruction },
      ...history.slice(-6).map(m => ({
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
          model: GROQ_MODEL,
          messages,
          stream: false,
          temperature: 0.7,
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

      return { text, sources };
    } catch (error) {
      console.error("Groq Service Error:", error);
      throw error;
    }
  }
};
