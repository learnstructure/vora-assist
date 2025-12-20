
import { UserProfile, Message, DocumentChunk } from '../types';

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_EMBED_MODEL = 'nomic-embed-text-v1.5';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_EMBED_ENDPOINT = 'https://api.groq.com/openai/v1/embeddings';

export const groqService = {
  getEmbedding: async (text: string): Promise<number[]> => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("Groq API Key is missing for embeddings.");

    try {
      const response = await fetch(GROQ_EMBED_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          input: text,
          model: GROQ_EMBED_MODEL
        })
      });

      if (!response.ok) {
        throw new Error(`Groq Embedding Error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      console.error("Groq Embedding Service Error:", error);
      throw error;
    }
  },

  cosineSimilarity: (vecA: number[], vecB: number[]): number => {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  },

  askGroq: async (
    query: string,
    history: Message[],
    profile: UserProfile,
    relevantChunks: DocumentChunk[]
  ): Promise<{ text: string; sources: string[] }> => {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      throw new Error("Groq API Key is missing. Please set GROQ_API_KEY in your .env.local file.");
    }

    const systemInstruction = `
      You are VORA Assist, an Intelligent Partner running on the Groq LPU engine.
      
      ### PARTNER CONTEXT
      Name: ${profile.name || 'Anonymous'}
      Role: ${profile.role || 'User'}
      Tech Stack: ${profile.technicalStack.join(', ')}

      ### SEMANTIC CONTEXT (LOCAL MEMORY)
      The following are snippets retrieved from the user's private local documents. Use them as the primary source of truth:
      ${relevantChunks.length > 0
        ? relevantChunks.map(c => `[Source: ${c.docTitle}]: ${c.text}`).join('\n\n')
        : 'No specific local documents matched this query. Use your general knowledge but mention that no local context was found if appropriate.'
      }

      ### INTERACTION STYLE
      - Be precise, lightning fast, and deeply helpful.
      - If you use information from the sources above, cite the document title.
      - You are speaking to ${profile.name || 'the user'}.
    `;

    const messages = [
      { role: 'system', content: systemInstruction },
      ...history.slice(-8).map(m => ({
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
          temperature: 0.6,
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
