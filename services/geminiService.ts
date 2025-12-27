
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

  askVoraStream: async function* (
    query: string,
    history: Message[],
    profile: UserProfile,
    relevantChunks: DocumentChunk[],
    allDocTitles: string[] = [],
    useSearch: boolean = false
  ): AsyncGenerator<{ text: string; groundingSources?: GroundingSource[]; sources: string[] }> {
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
      1. Use "USER CONTEXT" to inform perspective, tone, and sophistication.
      2. If query relates to user's goals/work, prioritize mission-aligned suggestions.
      3. CRITICAL: If query is general/unrelated, answer directly and efficiently. Do NOT force bio connections.
      4. Use conversation history for continuity.

      ### MEMORY BANK OVERVIEW (PRIVATE DATA)
      Total Documents: ${allDocTitles.length}
      Library Index: ${allDocTitles.length > 0 ? allDocTitles.join(', ') : 'Empty'}

      ### SEMANTIC SEARCH RESULTS
      Excerpts from user's private library:
      ${relevantChunks.length > 0
        ? relevantChunks.map(chunk => `[Source: ${chunk.docTitle}]: ${chunk.text}`).join('\n\n')
        : 'NO LOCAL DATA MATCHED.'
      }

      ${useSearch ? '### WEB SEARCH PROTOCOL\n- Use Google Search if private data is insufficient.' : ''}
    `.trim();

    const contents = history.slice(-12).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    contents.push({
      role: 'user',
      parts: [{ text: query }]
    });

    const sources = Array.from(new Set(relevantChunks.map(c => c.docTitle)));

    try {
      const config: any = {
        systemInstruction,
        temperature: 0.5,
      };

      if (useSearch) {
        config.tools = [{ googleSearch: {} }];
      }

      const result = await ai.models.generateContentStream({
        model: CHAT_MODEL,
        contents,
        config
      });

      let fullText = "";
      let groundingSources: GroundingSource[] = [];

      for await (const chunk of result) {
        const textChunk = chunk.text || "";
        fullText += textChunk;

        // Extract grounding if available in this chunk
        const metadata = chunk.candidates?.[0]?.groundingMetadata;
        if (metadata?.groundingChunks) {
          metadata.groundingChunks.forEach((c: any) => {
            if (c.web && c.web.uri) {
              const exists = groundingSources.some(gs => gs.url === c.web.uri);
              if (!exists) {
                groundingSources.push({
                  title: c.web.title || 'Web Source',
                  url: c.web.uri
                });
              }
            }
          });
        }

        yield { text: fullText, groundingSources: groundingSources.length > 0 ? groundingSources : undefined, sources };
      }
    } catch (error: any) {
      console.error("Gemini Streaming Error:", error);
      throw error;
    }
  }
};
