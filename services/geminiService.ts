
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { UserProfile, Document, Message, DocumentChunk } from '../types';

const CHAT_MODEL = 'gemini-3-pro-preview';
const EMBEDDING_MODEL = 'text-embedding-004';

export const geminiService = {
  getEmbedding: async (text: string): Promise<number[]> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: [{ parts: [{ text }] }],
    });
    return (response as any).embeddings[0].values;
  },

  cosineSimilarity: (vecA: number[], vecB: number[]): number => {
    let dotProduct = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
    }
    return dotProduct;
  },

  askPI: async (
    query: string,
    history: Message[],
    profile: UserProfile,
    relevantChunks: DocumentChunk[]
  ): Promise<{ text: string; sources: string[] }> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const systemInstruction = `
      You are VORA Assist, an Intelligent Partner designed for high-performance research and context-aware assistance.
      
      ### PARTNER CONTEXT
      Name: ${profile.name || 'Anonymous Partner'}
      Role: ${profile.role || 'Professional'}
      Tech Stack: ${profile.technicalStack.join(', ') || 'Not specified'}
      Background: ${profile.bio || 'General user'}

      ### KNOWLEDGE RETRIEVAL
      Use these specific excerpts from the user's local memory to answer accurately:
      
      ${relevantChunks.length > 0 
        ? relevantChunks.map(chunk => `[Source: ${chunk.docTitle}]: ${chunk.text}`).join('\n\n')
        : 'NO RELEVANT DOCUMENTS FOUND locally. Use your internal knowledge base but clarify it is general info.'
      }

      ### INTERACTION STYLE
      - Professional, intelligent, and highly personalized.
      - Always prioritize information found in the retrieved snippets.
      - Mention sources by title if directly quoted.
    `.trim();

    const contents = history.slice(-6).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    contents.push({
      role: 'user',
      parts: [{ text: query }]
    });

    try {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: CHAT_MODEL,
        contents,
        config: {
          systemInstruction,
          temperature: 0.5,
        }
      });

      const text = response.text || "I'm sorry, I couldn't generate a response.";
      const sources = Array.from(new Set(relevantChunks.map(c => c.docTitle)));
      
      return { text, sources };
    } catch (error: any) {
      console.error("Gemini Error:", error);
      throw error;
    }
  }
};
