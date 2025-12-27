
import { UserProfile, Message, DocumentChunk, GroqModel, GroundingSource } from '../types';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export const groqService = {
  askGroqStream: async function* (
    query: string,
    history: Message[],
    profile: UserProfile,
    relevantChunks: DocumentChunk[],
    allDocTitles: string[] = [],
    model: GroqModel = 'llama-3.3-70b-versatile'
  ): AsyncGenerator<{ text: string; sources: string[] }> {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      throw new Error("Groq API Key is missing.");
    }

    const systemInstruction = `
      You are VORA Assist, an Intelligent Partner.
      
      ### USER IDENTITY (CONTEXT)
      User Name: ${profile.name || 'Kaelen Voss'}
      Role: ${profile.role || 'User'}
      BIO, GOALS & MISSION: ${profile.bio || 'General Support'}
      Technical Stack: ${profile.technicalStack.join(', ')}

      ### OPERATIONAL DIRECTIVE
      - Use context for tone and expertise level.
      - If unrelated to user context, answer directly without mentions of the profile.
      - Build on history for continuity.

      ### MEMORY BANK (PRIVATE LIBRARY)
      Index: ${allDocTitles.length > 0 ? allDocTitles.join(', ') : 'None'}

      ### RETRIEVED SNIPPETS
      ${relevantChunks.length > 0
        ? relevantChunks.map(c => `[Source: ${c.docTitle}]: ${c.text}`).join('\n\n')
        : 'No specific local document matches.'
      }
    `;

    const messages = [
      { role: 'system', content: systemInstruction },
      ...history.slice(-12).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
      })),
      { role: 'user', content: query }
    ];

    const sources = Array.from(new Set(relevantChunks.map(c => c.docTitle)));

    const response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: model === 'openai/gpt-oss-120b' ? 0.4 : 0.6,
        max_tokens: 4096
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `Groq API Error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Could not initialize stream reader.");

    const decoder = new TextDecoder();
    let fullText = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              const content = json.choices[0]?.delta?.content || "";
              if (content) {
                fullText += content;
                yield { text: fullText, sources };
              }
            } catch (e) {
              // Ignore partial JSON chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
};
