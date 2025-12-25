
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { UserProfile, Message, DocumentChunk, GroundingSource } from '../types';

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

      const values = response.embeddings[0].values;
      if (!values) {
        throw new Error("Embedding response contained no vector values.");
      }

      return values;
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
  ): Promise<{ text: string; sources: string[]; groundingSources?: GroundingSource[] }> => {
    if (!process.env.API_KEY) throw new Error("Gemini API Key is missing.");

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const systemInstruction = `
      You are VORA Assist, a high-fidelity Intelligent Partner.
      
      ### CORE IDENTITY & MISSION (CRITICAL MANDATE)
      User Name: ${profile.name || 'Kaelen Voss'}
      Current Role: ${profile.role || 'User'}
      BIO, GOALS & MISSION: ${profile.bio || 'General Support'}
      Expertise Stack: ${profile.technicalStack.join(', ') || 'General Knowledge'}

      ### OPERATIONAL DIRECTIVE
      Your primary framework is the "BIO, GOALS & MISSION". Tailor all responses to support these goals.
      IMPORTANT: You have been provided with the conversation history below. Use it to maintain absolute continuity in your logic and suggestions.

      ### MEMORY BANK OVERVIEW (PRIVATE DATA)
      Total Documents: ${allDocTitles.length}
      Library Index: ${allDocTitles.length > 0 ? allDocTitles.join(', ') : 'Empty'}

      ### SEMANTIC SEARCH RESULTS
      The following are excerpts from the user's private library that matched the query:
      ${relevantChunks.length > 0
        ? relevantChunks.map(chunk => `[Source: ${chunk.docTitle}]: ${chunk.text}`).join('\n\n')
        : 'NO LOCAL DATA MATCHED.'
      }

      ### WEB SEARCH PROTOCOL
      - If the private data is insufficient or the query requires real-time information, use the Google Search tool.
      - Synthesize private memory with public web data to provide a comprehensive answer.
    `.trim();

    // Increased history context to 12 for deeper session memory
    const contents = history.slice(-12).map(msg => ({
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
          tools: [{ googleSearch: {} }]
        }
      });

      const text = response.text || "I'm sorry, I couldn't generate a response.";
      const sources = Array.from(new Set(relevantChunks.map(c => c.docTitle)));

      const groundingSources: GroundingSource[] = [];
      const metadata = response.candidates?.[0]?.groundingMetadata;

      if (metadata?.groundingChunks) {
        metadata.groundingChunks.forEach((chunk: any) => {
          if (chunk.web && chunk.web.uri) {
            groundingSources.push({
              title: chunk.web.title || 'Web Source',
              url: chunk.web.uri
            });
          }
        });
      }

      return {
        text,
        sources,
        groundingSources: groundingSources.length > 0 ? groundingSources : undefined
      };
    } catch (error: any) {
      console.error("Gemini Error:", error);
      throw error;
    }
  }
};
