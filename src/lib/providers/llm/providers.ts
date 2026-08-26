import type { LLMProvider, LlmMessage, LlmCompletionOptions } from "../types";

/**
 * Google Gemini Provider (Gemini 1.5 Flash).
 * Massive 1-Million token context window natively designed for 10-hour lecture
 * transcripts, mixed Urdu, English, and Punjabi understanding.
 */
export class GeminiProvider implements LLMProvider {
  readonly name = "gemini_1.5_flash";

  async complete(messages: LlmMessage[], options: LlmCompletionOptions = {}): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) throw new Error("GEMINI_API_KEY is required for Gemini provider");

    const systemPrompt = messages.find((m) => m.role === "system")?.content || "";
    const userMessages = messages.filter((m) => m.role !== "system");

    const promptText = [
      systemPrompt ? `[SYSTEM INSTRUCTION]\n${systemPrompt}\n\n` : "",
      ...userMessages.map((m) => `[${m.role.toUpperCase()}]:\n${m.content}`),
    ].join("\n\n");

    const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const body: any = {
      contents: [
        {
          role: "user",
          parts: [{ text: promptText }],
        },
      ],
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxTokens ?? 4096,
      },
    };

    if (options.jsonMode) {
      body.generationConfig.responseMimeType = "application/json";
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text ?? "";
    return text.trim();
  }
}

/**
 * Local Ollama provider — free, runs on the host machine.
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
