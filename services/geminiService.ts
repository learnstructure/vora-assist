
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { UserProfile, Message, DocumentChunk } from '../types';

const CHAT_MODEL = 'gemini-3-flash-preview';
const EMBEDDING_MODEL = 'text-embedding-004';

export const geminiService = {
  getEmbedding: async (text: string, isQuery: boolean = false): Promise<number[]> => {
    if (!process.env.API_KEY) throw new Error("Gemini API Key is missing. Gemini is required for document indexing (Memory Bank).");

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    try {
      const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: [{ parts: [{ text }] }],
        config: {
          taskType: isQuery ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
        },
      });

      if (!response.embeddings || response.embeddings.length === 0) {
        throw new Error("No embedding returned from Gemini.");
      }

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

  askVora: async (
    query: string,
    history: Message[],
    profile: UserProfile,
    relevantChunks: DocumentChunk[],
    allDocTitles: string[] = []
  ): Promise<{ text: string; sources: string[] }> => {
    if (!process.env.API_KEY) throw new Error("Gemini API Key is missing.");

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const systemInstruction = `
      You are VORA Assist, an Intelligent Partner.
      
      ### PARTNER CONTEXT
      Name: ${profile.name || 'Kaelen Voss'}
      Role: ${profile.role || 'User'}
      Tech Stack: ${profile.technicalStack.join(', ') || 'General Knowledge'}

      ### MEMORY BANK OVERVIEW
      You have access to a private document library. 
      Total Documents: ${allDocTitles.length}
      Library Index (Titles): ${allDocTitles.length > 0 ? allDocTitles.join(', ') : 'Empty'}

      ### SEMANTIC SEARCH RESULTS
      The following are specific excerpts from the Memory Bank that matched the user's current query:
      
      ${relevantChunks.length > 0
        ? relevantChunks.map(chunk => `[Source: ${chunk.docTitle}]: ${chunk.text}`).join('\n\n')
        : 'NO HIGH-CONFIDENCE MATCHES FOUND for this specific query. If the library index above suggests a document might be relevant, ask the user for clarification.'
      }

      ### PROTOCOL
      - Always prioritize the provided snippets.
      - If answering from memory, cite the source title.
      - Maintain a professional, executive-level tone.
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
