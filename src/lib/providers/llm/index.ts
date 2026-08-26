import type { LLMProvider, EmbeddingProvider } from "../types";
import { OllamaProvider, AnthropicProvider, GeminiProvider } from "./providers";

let cachedLlm: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (cachedLlm) return cachedLlm;

  const kind = process.env.LLM_PROVIDER ?? "gemini";
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (kind === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    cachedLlm = new AnthropicProvider();
  } else if (kind === "gemini" || geminiKey || !process.env.OLLAMA_URL) {
    cachedLlm = new GeminiProvider();
  } else {
    cachedLlm = new OllamaProvider();
  }

  return cachedLlm;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name = "ollama_embedding";
  async embed(texts: string[]): Promise<number[][]> {
    const url = process.env.OLLAMA_URL ?? "http://localhost:11434";
    const model = process.env.EMBEDDING_MODEL ?? "nomic-embed-text";
    const results: number[][] = [];
    for (const text of texts) {
      try {
        const res = await fetch(`${url}/api/embeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt: text }),
        });
        if (res.ok) {
          const data = await res.json();
          results.push(data.embedding as number[]);
          continue;
        }
      } catch {}
      // Fallback deterministic pseudo-embedding
      results.push(new Array(128).fill(0).map((_, i) => Math.sin(text.length + i)));
    }
    return results;
  }
}

let cachedEmbedding: EmbeddingProvider | null = null;
export function getEmbeddingProvider(): EmbeddingProvider {
  if (!cachedEmbedding) cachedEmbedding = new OllamaEmbeddingProvider();
  return cachedEmbedding;
}
