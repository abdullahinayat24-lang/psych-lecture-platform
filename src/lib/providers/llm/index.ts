import type { LLMProvider, EmbeddingProvider } from "../types";
import { OllamaProvider, AnthropicProvider } from "./providers";

let cachedLlm: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (cachedLlm) return cachedLlm;
  const kind = process.env.LLM_PROVIDER ?? "ollama_local";
  cachedLlm = kind === "anthropic" ? new AnthropicProvider() : new OllamaProvider();
  return cachedLlm;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name = "ollama_embedding";
  async embed(texts: string[]): Promise<number[][]> {
    const url = process.env.OLLAMA_URL ?? "http://localhost:11434";
    const model = process.env.EMBEDDING_MODEL ?? "nomic-embed-text";
    const results: number[][] = [];
    for (const text of texts) {
      const res = await fetch(`${url}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: text }),
      });
      if (!res.ok) throw new Error(`Embedding error: ${res.status}`);
      const data = await res.json();
      results.push(data.embedding as number[]);
    }
    return results;
  }
}

let cachedEmbedding: EmbeddingProvider | null = null;
export function getEmbeddingProvider(): EmbeddingProvider {
  if (!cachedEmbedding) cachedEmbedding = new OllamaEmbeddingProvider();
  return cachedEmbedding;
}
