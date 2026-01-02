
import { GoogleGenAI, Type } from "@google/genai";
import { UserProfile, Message, DocumentChunk, GroundingSource } from '../types';

const CHAT_MODEL = 'gemini-3-flash-preview';
const VISION_MODEL = 'gemini-3-flash-preview';
const EMBEDDING_MODEL = 'text-embedding-004';

export const geminiService = {
  getEmbedding: async (text: string): Promise<number[]> => {
    if (!process.env.API_KEY) throw new Error("Gemini API Key is missing. Gemini is required for document indexing.");

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    try {
      // Use 'contents' (plural) for embedding requests as per latest SDK/compiler requirements
      const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: [{ parts: [{ text }] }],
      });

      // Access plural 'embeddings' array and return values from the first element
      // Added explicit check for 'values' to satisfy TypeScript's strict null checks
      if (!response.embeddings || response.embeddings.length === 0 || !response.embeddings[0].values) {
        throw new Error("No valid embedding values returned from Gemini.");
      }

      return response.embeddings[0].values;
    } catch (error: any) {
      console.error("Gemini Embedding Error:", error);
      throw new Error(error.message || "Failed to generate embedding");
    }
  },

  processPageWithVision: async (base64Image: string): Promise<string> => {
    if (!process.env.API_KEY) throw new Error("API Key missing");
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const prompt = "Convert this document page into high-fidelity Markdown. EXTREMELY IMPORTANT: 1. Convert all mathematical equations to LaTeX format using $ or $$ delimiters. 2. Preserve tables using Markdown table syntax. 3. Maintain structural headers (# ## ###). 4. Do not summarize; transcribe accurately.";

    const response = await ai.models.generateContent({
      model: VISION_MODEL,
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
          { text: prompt }
        ]
      }
    });

    return response.text || "";
  },

  rerankChunks: async (query: string, chunks: DocumentChunk[]): Promise<DocumentChunk[]> => {
    if (chunks.length <= 3) return chunks;
    if (!process.env.API_KEY) return chunks;

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const chunkContext = chunks.map((c, i) => `[ID: ${i}] [Doc: ${c.docTitle}]: ${c.text}`).join('\n\n');

    const prompt = `User Query: "${query}"\n\nBelow are the top relevant snippets from the user's memory. Rank them based on how well they answer the query, prioritizing technical accuracy and mathematical relevance. Return only the top 3 IDs as a JSON array of numbers.\n\nSnippets:\n${chunkContext}`;

    try {
      const response = await ai.models.generateContent({
        model: CHAT_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER }
          },
          thinkingConfig: { thinkingBudget: 2000 }
        }
      });

      const topIndices: number[] = JSON.parse(response.text || "[]");
      return topIndices.map(idx => chunks[idx]).filter(Boolean);
    } catch (err) {
      console.warn("Reranking failed, falling back to vector score", err);
      return chunks.slice(0, 3);
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
      
      ### USER CONTEXT
      User: ${profile.name || 'Partner'}
      Role: ${profile.role || 'Expert'}
      Mission: ${profile.bio || 'General Intelligence Support'}

      ### OPERATIONAL DIRECTIVE
      1. Use "USER CONTEXT" for perspective.
      2. Priority: Private Memory. If Memory Bank snippets are provided, treat them as the absolute truth for this user.
      3. For technical/math queries, use LaTeX.

      ### MEMORY BANK (PRIVATE DATA)
      Total Documents: ${allDocTitles.length}
      Snippets Provided: ${relevantChunks.length}
      
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
        temperature: 0.3,
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
