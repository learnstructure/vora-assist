
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { UserProfile, Message, DocumentChunk, GroundingSource, AIResponse } from '../types';

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
    allDocTitles: string[] = [],
    useSearch: boolean = false
  ): Promise<AIResponse> => {
    if (!process.env.API_KEY) throw new Error("Gemini API Key is missing.");

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const systemInstruction = `
      You are VORA Assist, a high-fidelity Intelligent Partner.
      
      ### USER CONTEXT (BACKGROUND)
      User Name: ${profile.name || 'Kaelen Voss'}
      Current Role: ${profile.role || 'User'}
      BIO, GOALS & MISSION: ${profile.bio || 'General Support'}
      Expertise Stack: ${profile.technicalStack.join(', ') || 'General Knowledge'}

      ### OPERATIONAL DIRECTIVE
      1. Use the "USER CONTEXT" to inform your perspective, tone, and the sophistication of your technical explanations.
      2. If a query relates to the user's goals or work, prioritize suggestions that align with their mission.
      3. CRITICAL: If a query is general, factual, or unrelated to the user's profile, answer it directly and efficiently. Do NOT force a connection to the user's bio if it is irrelevant to the specific question.
      4. Use the conversation history to maintain continuity.

      ### MEMORY BANK OVERVIEW (PRIVATE DATA)
      Total Documents: ${allDocTitles.length}
      Library Index: ${allDocTitles.length > 0 ? allDocTitles.join(', ') : 'Empty'}

      ### SEMANTIC SEARCH RESULTS
      The following are excerpts from the user's private library that matched the query:
      ${relevantChunks.length > 0
        ? relevantChunks.map(chunk => `[Source: ${chunk.docTitle}]: ${chunk.text}`).join('\n\n')
        : 'NO LOCAL DATA MATCHED.'
      }

      ${useSearch ? '### WEB SEARCH PROTOCOL\n- Use Google Search if private data is insufficient or real-time info is needed.' : ''}
    `.trim();

    const contents = history.slice(-12).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    contents.push({
      role: 'user',
      parts: [{ text: query }]
    });

    try {
      const config: any = {
        systemInstruction,
        temperature: 0.5,
      };

      if (useSearch) {
        config.tools = [{ googleSearch: {} }];
      }

      const response: GenerateContentResponse = await ai.models.generateContent({
        model: CHAT_MODEL,
        contents,
        config
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
