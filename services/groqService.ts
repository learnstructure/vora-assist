
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
      throw new Error("Groq API Key is missing. Please check your environment variables.");
    }

    const systemInstruction = `
      You are VORA Assist, a high-fidelity Intelligent Partner.
      
      ### USER CONTEXT
      User: ${profile.name || 'Partner'}
      Role: ${profile.role || 'Expert'}
      Mission: ${profile.bio || 'General Intelligence Support'}
      Stack: ${profile.technicalStack.join(', ') || 'General Technical'}

      ### OPERATIONAL DIRECTIVE
      1. Use "USER CONTEXT"  if necessary for perspective and tone.
      2. Priority: Private Memory. If Memory Bank snippets are provided, treat them as the absolute truth for this user.
      3. For technical/math queries, ALWAYS use LaTeX format using $ or $$ delimiters.
      4. Maintain professional, high-fidelity continuity based on the conversation history.

      ### MEMORY BANK (PRIVATE DATA)
      Total Documents indexed: ${allDocTitles.length}
      Snippets Provided: ${relevantChunks.length}
      
      ${relevantChunks.length > 0
        ? relevantChunks.map(c => `[Source: ${c.docTitle}]: ${c.text}`).join('\n\n')
        : 'NO SPECIFIC LOCAL DATA MATCHED.'
      }
    `.trim();

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
        temperature: 0.3,
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
    let buffer = ""; // Buffer to handle partial lines

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Keep the last partial line in the buffer
        buffer = lines.pop() || "";

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
              // If JSON is incomplete, we could potentially add it back to buffer,
              // but standard OpenAI-style streams usually send complete JSON objects per line.
              console.warn("Skipping partial or invalid JSON chunk");
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
};
