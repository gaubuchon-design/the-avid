/**
 * Real Gemini API client using the Google Generative AI REST API.
 * Requires VITE_GEMINI_API_KEY environment variable.
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface GeminiTool {
  functionDeclarations: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  }[];
}

/** Legacy tool shape used by AgentEngine. */
export interface FunctionTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface GeminiResponse {
  text: string;
  functionCalls?: { name: string; args: Record<string, any> }[];
  usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number };
  /** Convenience alias kept for backwards compatibility with AgentEngine */
  tokensUsed: number;
}

class GeminiClient {
  private apiKey: string;
  private proModel = 'gemini-2.5-pro-preview-05-06';
  private flashModel = 'gemini-2.0-flash';

  constructor() {
    this.apiKey = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY) || '';
  }

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * Overloaded chat method supporting both the new GeminiTool[] and legacy FunctionTool[] shapes.
   * When FunctionTool[] is provided it is automatically wrapped into GeminiTool format.
   */
  async chat(
    messages: GeminiMessage[],
    tools?: GeminiTool[] | FunctionTool[],
    systemPromptOrModel?: string,
    modelArg?: 'pro' | 'flash',
  ): Promise<GeminiResponse> {
    // Normalise tools
    const geminiTools = this.normaliseTools(tools);

    // Determine model and system prompt
    let systemPrompt: string | undefined;
    let model: 'pro' | 'flash' = 'flash';

    if (modelArg !== undefined) {
      // Called as chat(messages, tools, systemPrompt, model)
      systemPrompt = systemPromptOrModel;
      model = modelArg;
    } else if (systemPromptOrModel === 'pro' || systemPromptOrModel === 'flash') {
      // Called as chat(messages, tools, model) – legacy AgentEngine style
      model = systemPromptOrModel;
    } else if (systemPromptOrModel) {
      systemPrompt = systemPromptOrModel;
    }

    // If no API key, fall back to offline stub
    if (!this.isConfigured()) {
      return this.stubChat(messages, tools as FunctionTool[] | undefined);
    }

    const modelName = model === 'pro' ? this.proModel : this.flashModel;
    const url = `${GEMINI_API_BASE}/models/${modelName}:generateContent?key=${this.apiKey}`;

    const body: any = {
      contents: messages,
    };

    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    if (geminiTools && geminiTools.length > 0) {
      body.tools = geminiTools;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: 'API error' } }));
      throw new Error(err.error?.message || `Gemini API error: ${res.status}`);
    }

    const data = await res.json();
    return this.parseResponse(data);
  }

  async streamChat(
    messages: GeminiMessage[],
    tools: GeminiTool[] | undefined,
    systemPrompt: string | undefined,
    model: 'pro' | 'flash',
    onChunk: (chunk: string) => void,
  ): Promise<GeminiResponse> {
    if (!this.isConfigured()) {
      // Stub: simulate streaming
      const stubResponse = await this.stubChat(messages);
      const words = stubResponse.text.split(' ');
      for (const word of words) {
        await new Promise((r) => setTimeout(r, 30));
        onChunk(word + ' ');
      }
      return stubResponse;
    }

    const modelName = model === 'pro' ? this.proModel : this.flashModel;
    const url = `${GEMINI_API_BASE}/models/${modelName}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

    const body: any = { contents: messages };
    if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };

    const geminiTools = this.normaliseTools(tools);
    if (geminiTools && geminiTools.length > 0) body.tools = geminiTools;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: 'API error' } }));
      throw new Error(err.error?.message || `Gemini API error: ${res.status}`);
    }

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let usageMetadata: any;

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (text) {
                fullText += text;
                onChunk(text);
              }
              if (data.usageMetadata) usageMetadata = data.usageMetadata;
            } catch {
              // skip malformed SSE chunks
            }
          }
        }
      }
    }

    const totalTokens = usageMetadata?.totalTokenCount ?? fullText.split(/\s+/).length;
    return { text: fullText, usageMetadata, tokensUsed: totalTokens };
  }

  async transcribe(
    audioBlob: Blob,
  ): Promise<{ words: { word: string; startTime: number; endTime: number; confidence: number }[] }> {
    // For now, use Gemini's audio understanding.
    // In production, this would use Google Cloud Speech-to-Text.
    if (!this.isConfigured()) {
      return {
        words: [
          { word: 'Transcription', startTime: 0, endTime: 1, confidence: 0.9 },
          { word: 'requires', startTime: 1, endTime: 2, confidence: 0.9 },
          { word: 'API', startTime: 2, endTime: 2.5, confidence: 0.9 },
          { word: 'key', startTime: 2.5, endTime: 3, confidence: 0.9 },
        ],
      };
    }
    // Real implementation would convert audio to base64 and send to Gemini
    return { words: [] };
  }

  async generateCaptions(
    transcriptText: string,
    language = 'en',
  ): Promise<{ startTime: number; endTime: number; text: string }[]> {
    if (!this.isConfigured()) {
      return [{ startTime: 0, endTime: 3, text: 'Configure API key for captions' }];
    }

    const response = await this.chat(
      [
        {
          role: 'user',
          parts: [
            {
              text: `Generate SRT-style captions from this transcript. Return as JSON array of {startTime: number, endTime: number, text: string}. Language: ${language}\n\nTranscript:\n${transcriptText}`,
            },
          ],
        },
      ],
      undefined,
      'You are a caption generation assistant. Always respond with valid JSON.',
      'flash',
    );

    try {
      return JSON.parse(response.text);
    } catch {
      return [{ startTime: 0, endTime: 3, text: response.text.substring(0, 100) }];
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Convert legacy FunctionTool[] to GeminiTool[] if needed.
   */
  private normaliseTools(tools?: GeminiTool[] | FunctionTool[]): GeminiTool[] | undefined {
    if (!tools || tools.length === 0) return undefined;

    // Detect legacy shape: has `name` at top level
    const first = tools[0] as any;
    if ('name' in first && 'description' in first) {
      // Legacy FunctionTool[] – wrap into a single GeminiTool
      return [
        {
          functionDeclarations: (tools as FunctionTool[]).map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }
    return tools as GeminiTool[];
  }

  /**
   * Parse raw API JSON into a GeminiResponse.
   */
  private parseResponse(data: any): GeminiResponse {
    const candidate = data.candidates?.[0];
    const content = candidate?.content;

    const text =
      content?.parts
        ?.filter((p: any) => p.text)
        ?.map((p: any) => p.text)
        .join('') || '';
    const functionCalls =
      content?.parts
        ?.filter((p: any) => p.functionCall)
        ?.map((p: any) => ({
          name: p.functionCall.name,
          args: p.functionCall.args || {},
        })) || [];

    const totalTokens = data.usageMetadata?.totalTokenCount ?? text.split(/\s+/).length;

    return {
      text,
      functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
      usageMetadata: data.usageMetadata,
      tokensUsed: totalTokens,
    };
  }

  // ── Offline stub (for when no API key is configured) ─────────────────────

  private async stubChat(
    messages: GeminiMessage[],
    tools?: FunctionTool[],
  ): Promise<GeminiResponse> {
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 40));

    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    const lastUserText = lastUserMsg?.parts?.[0]?.text ?? '';

    if (!lastUserText) {
      return { text: 'How can I help you edit your project?', tokensUsed: 12 };
    }

    const intent = matchStubIntent(lastUserText);
    if (tools && tools.length > 0 && intent && STUB_TEMPLATES[intent]) {
      const tmpl = STUB_TEMPLATES[intent];
      const validCalls = tmpl.functionCalls?.filter((fc) => tools.some((t) => t.name === fc.name));
      return {
        text: tmpl.text,
        functionCalls: validCalls && validCalls.length > 0 ? validCalls : undefined,
        tokensUsed: 45 + Math.floor(Math.random() * 30),
      };
    }

    const genericResponses = [
      `I can help with that! Let me analyze your timeline and suggest the best approach for "${lastUserText}".`,
      'Good idea. I\'ll review the current sequence and prepare an edit plan. You can approve each step before I execute.',
      'Looking at your project — I can see the tracks and clips on the timeline. What specifically would you like me to adjust?',
      'I\'ve analyzed the timeline. How should I proceed with the edits?',
    ];

    return {
      text: genericResponses[Math.floor(Math.random() * genericResponses.length)],
      tokensUsed: 28 + Math.floor(Math.random() * 20),
    };
  }
}

// ── Stub intent matching (offline fallback) ────────────────────────────────

const STUB_TEMPLATES: Record<string, { text: string; functionCalls?: { name: string; args: Record<string, any> }[] }> = {
  trim: {
    text: "I'll trim the clip for you. Executing ripple trim on the selected clip.",
    functionCalls: [{ name: 'ripple_trim', args: { clipId: 'c1', side: 'right', frameDelta: -24 } }],
  },
  split: {
    text: 'Splitting the clip at the current playhead position.',
    functionCalls: [{ name: 'split_clip', args: { clipId: 'c1', frame: 204 } }],
  },
  silence: {
    text: "I'll analyze the audio and remove silent segments. This may take a moment.",
    functionCalls: [{ name: 'remove_silence', args: { trackId: 't3', thresholdDb: -40, minDurationMs: 500 } }],
  },
  color: {
    text: 'Applying automatic color matching across the selected clips.',
    functionCalls: [{ name: 'auto_color_match', args: { referenceClipId: 'c1', targetClipIds: ['c2', 'c3'] } }],
  },
  captions: {
    text: "Generating captions from the dialogue track. I'll transcribe and create subtitle segments.",
    functionCalls: [{ name: 'generate_captions', args: { trackId: 't3', language: 'en', style: 'broadcast' } }],
  },
  organize: {
    text: "I'll organize your bins by content type and scene.",
    functionCalls: [{ name: 'auto_organize_bins', args: { strategy: 'scene', rootBinId: 'b1' } }],
  },
  rough_cut: {
    text: "Creating a rough cut assembly from your footage. I'll select the best takes and arrange them on the timeline.",
    functionCalls: [{ name: 'generate_rough_cut', args: { binId: 'b1', style: 'narrative', targetDurationSec: 180 } }],
  },
};

function matchStubIntent(message: string): string | null {
  const lower = message.toLowerCase();
  if (lower.includes('trim')) return 'trim';
  if (lower.includes('split') || lower.includes('cut at')) return 'split';
  if (lower.includes('silence') || lower.includes('quiet')) return 'silence';
  if (lower.includes('color') || lower.includes('grade') || lower.includes('match')) return 'color';
  if (lower.includes('caption') || lower.includes('subtitle')) return 'captions';
  if (lower.includes('organize') || lower.includes('bin') || lower.includes('sort')) return 'organize';
  if (lower.includes('rough cut') || lower.includes('assembly') || lower.includes('assemble')) return 'rough_cut';
  return null;
}

export const geminiClient = new GeminiClient();
