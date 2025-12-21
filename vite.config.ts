
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // This loads .env, .env.local, .env.development, etc.
  // Fix: Property 'cwd' does not exist on type 'Process' by casting to any to satisfy the compiler in Node contexts
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Maps either API_KEY or GEMINI_API_KEY to process.env.API_KEY
      'process.env.API_KEY': JSON.stringify(env.API_KEY || env.GEMINI_API_KEY),
      'process.env.GROQ_API_KEY': JSON.stringify(env.GROQ_API_KEY),
    },
    server: {
      host: true,
      port: 3000
    }
  };
});
