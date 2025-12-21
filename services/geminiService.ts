
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { UserProfile, Message, DocumentChunk } from '../types';

const CHAT_MODEL = 'gemini-3-flash-preview';
const EMBEDDING_MODEL = 'text-embedding-004';

export const geminiService = {
  getEmbedding: async (text: string, isQuery: boolean = false): Promise<number[]> => {
    // ALWAYS use process.env.API_KEY directly when initializing the client
    if (!process.env.API_KEY) throw new Error("Gemini API Key is missing. Gemini is required for document indexing (Memory Bank).");

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    /**
     * Use ai.models.embedContent to generate vector embeddings.
     */
    try {
      // Fix: In the @google/genai SDK, taskType is placed inside the config object rather than at the top level of EmbedContentParameters.
      const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: [{ parts: [{ text }] }],
        config: {
          taskType: isQuery ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
        },
      });

      // The SDK returns an 'embeddings' array when 'contents' is provided as an array.
      if (!response.embeddings || response.embeddings.length === 0) {
        throw new Error("No embedding returned from Gemini.");
      }

      // Retrieve the values from the first item in the embeddings array.
      return response.embeddings[0].values;
    } catch (error: any) {
      console.error("Gemini Embedding Error:", error);
      throw new Error(error.message || "Failed to generate embedding");
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
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  },

  askPI: async (
    query: string,
    history: Message[],
    profile: UserProfile,
    relevantChunks: DocumentChunk[]
  ): Promise<{ text: string; sources: string[] }> => {
    // ALWAYS use process.env.API_KEY directly when initializing the client
    if (!process.env.API_KEY) throw new Error("Gemini API Key is missing.");

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

      // Directly access .text property as it is a getter, not a method
      const text = response.text || "I'm sorry, I couldn't generate a response.";
      const sources = Array.from(new Set(relevantChunks.map(c => c.docTitle)));

      return { text, sources };
    } catch (error: any) {
      console.error("Gemini Error:", error);
      throw error;
    }
  }
};
