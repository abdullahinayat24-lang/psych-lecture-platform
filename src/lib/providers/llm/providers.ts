import type { LLMProvider, LlmMessage, LlmCompletionOptions } from "../types";

/**
 * Local Ollama provider — free, runs entirely on the teacher's own
 * hardware, no data leaves the machine. Default provider for this
 * deployment. Requires Ollama running with OLLAMA_MODEL pulled.
 */
export class OllamaProvider implements LLMProvider {
  readonly name = "ollama_local";

  async complete(messages: LlmMessage[], options: LlmCompletionOptions = {}): Promise<string> {
    const url = process.env.OLLAMA_URL ?? "http://localhost:11434";
    const model = process.env.OLLAMA_MODEL ?? "llama3.1:8b";

    const res = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        format: options.jsonMode ? "json" : undefined,
        options: {
          temperature: options.temperature ?? 0.3,
          num_predict: options.maxTokens ?? 1024,
        },
      }),
    });

    if (!res.ok) throw new Error(`Ollama error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.message?.content ?? "";
  }
}

/** Anthropic provider — used when higher-quality analysis is worth the API cost. */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";

  async complete(messages: LlmMessage[], options: LlmCompletionOptions = {}): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required for the anthropic provider");

    const system = messages.find((m) => m.role === "system")?.content;
    const rest = messages.filter((m) => m.role !== "system");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: options.maxTokens ?? 1024,
        system,
        messages: rest,
      }),
    });

    if (!res.ok) throw new Error(`Anthropic error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.content?.map((c: any) => c.text ?? "").join("") ?? "";
  }
}
