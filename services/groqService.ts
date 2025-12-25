
import { UserProfile, Message, DocumentChunk, GroqModel } from '../types';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export const groqService = {
  askGroq: async (
    query: string,
    history: Message[],
    profile: UserProfile,
    relevantChunks: DocumentChunk[],
    allDocTitles: string[] = [],
    model: GroqModel = 'llama-3.3-70b-versatile'
  ): Promise<{ text: string; sources: string[] }> => {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      throw new Error("Groq API Key is missing. Please set GROQ_API_KEY.");
    }

    const systemInstruction = `
      You are VORA Assist, an Intelligent Partner running on the Groq LPU engine.
      
      ### CORE IDENTITY & MISSION (CRITICAL)
      User Name: ${profile.name || 'Kaelen Voss'}
      Current Role: ${profile.role || 'User'}
      Mission & Background: ${profile.bio || 'General Support'}
      Expertise Stack: ${profile.technicalStack.join(', ') || 'General Knowledge'}

      ### OPERATIONAL DIRECTIVE
      Strictly align your responses with the user's "Mission & Background" provided above. This context defines your reasoning framework and the goals you are helping the user achieve.

      ### MEMORY BANK (PRIVATE LIBRARY)
      You are connected to a local document store.
      Library Index: ${allDocTitles.length > 0 ? allDocTitles.join(', ') : 'No documents uploaded yet.'}

      ### SEARCH SNIPPETS
      Excerpts retrieved for this query:
      ${relevantChunks.length > 0
        ? relevantChunks.map(c => `[Source: ${c.docTitle}]: ${c.text}`).join('\n\n')
        : 'No specific document chunks matched this semantic search.'
      }

      ### PROTOCOL
      - Be precise and deeply helpful.
      - If snippets are provided, they are your primary source of truth.
      - Cite source titles clearly.
      - Maintain your partner persona at all times.
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

      return { text, sources };
    } catch (error) {
      console.error("Groq Service Error:", error);
      throw error;
    }
  }
};
