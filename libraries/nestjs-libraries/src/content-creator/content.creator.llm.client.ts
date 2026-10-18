import { Injectable, Logger } from '@nestjs/common';

export const DEFAULT_CONTENT_CREATOR_MODEL = 'gpt-5.6-sol';
export const DEFAULT_CONTENT_CREATOR_MAX_TOKENS = 800;
export const DEFAULT_OPENAI_API_URL = 'https://api.openai.com/v1';

export interface ContentCreatorLlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ContentCreatorLlmCompletion {
  text: string;
  model: string;
  usage: ContentCreatorLlmUsage;
}

export interface ContentCreatorLlmRequest {
  system: string;
  user: string;
  maxTokens: number;
  model: string;
}

@Injectable()
export class ContentCreatorLlmClient {
  private readonly _logger = new Logger(ContentCreatorLlmClient.name);

  async complete(
    request: ContentCreatorLlmRequest
  ): Promise<ContentCreatorLlmCompletion> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    const messages = [
      { role: 'system', content: request.system },
      { role: 'user', content: request.user },
    ];
    const chatAttempts: Record<string, unknown>[] = [
      { model: request.model, messages, max_tokens: request.maxTokens },
      {
        model: request.model,
        messages,
        max_completion_tokens: request.maxTokens,
      },
    ];

    let lastFailure: { status: number; raw: string } | undefined;
    for (const payload of chatAttempts) {
      const chatResult = await this.postJson(
        '/chat/completions',
        payload,
        apiKey
      );
      if (chatResult.ok) {
        return this.parseChatCompletion(chatResult.body, request.model);
      }

      lastFailure = { status: chatResult.status, raw: chatResult.raw };
      if (chatResult.status === 404) {
        break;
      }
      if (chatResult.status !== 400) {
        throw this.upstreamError(chatResult.status, chatResult.raw);
      }
    }

    const responsesResult = await this.postJson(
      '/responses',
      {
        model: request.model,
        instructions: request.system,
        input: request.user,
        max_output_tokens: request.maxTokens,
      },
      apiKey
    );
    if (responsesResult.ok) {
      return this.parseResponsesApi(responsesResult.body, request.model);
    }

    throw this.upstreamError(
      responsesResult.status || lastFailure?.status || 502,
      responsesResult.raw || lastFailure?.raw || ''
    );
  }

  resolveBaseUrl(raw = process.env.OPENAI_API_URL): string {
    const fallback = DEFAULT_OPENAI_API_URL;
    if (!raw?.trim()) {
      return fallback;
    }

    const trimmed = raw.trim().replace(/\/+$/, '');
    try {
      const url = new URL(trimmed);
      if (
        (url.hostname === 'api.openai.com' || url.hostname === 'openai.com') &&
        (url.pathname === '' || url.pathname === '/')
      ) {
        return `${url.origin}/v1`;
      }
    } catch {
      return trimmed;
    }

    return trimmed;
  }

  resolveModel(raw = process.env.CONTENT_CREATOR_MODEL): string {
    return raw?.trim() || DEFAULT_CONTENT_CREATOR_MODEL;
  }

  resolveMaxTokens(
    maxLength?: number,
    raw = process.env.CONTENT_CREATOR_MAX_TOKENS
  ): number {
    const envMax = parsePositiveInt(raw, DEFAULT_CONTENT_CREATOR_MAX_TOKENS);
    if (!maxLength) {
      return envMax;
    }

    return Math.max(16, Math.min(envMax, Math.ceil(maxLength / 2) + 48));
  }

  private async postJson(
    path: string,
    payload: Record<string, unknown>,
    apiKey: string
  ): Promise<{ ok: boolean; status: number; body: any; raw: string }> {
    const url = `${this.resolveBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch {
      this._logger.error(
        `Content Creator LLM request failed to reach ${this.hostLabel(url)}`
      );
      throw new Error('Content Creator LLM request failed');
    }

    const raw = await response.text();
    if (!response.ok) {
      this._logger.error(
        `Content Creator LLM ${path} returned ${response.status}`
      );
      return { ok: false, status: response.status, body: undefined, raw };
    }

    try {
      return {
        ok: true,
        status: response.status,
        body: JSON.parse(raw),
        raw,
      };
    } catch {
      this._logger.error('Content Creator LLM returned a non-JSON body');
      throw new Error('Content Creator LLM returned invalid JSON');
    }
  }

  private parseChatCompletion(
    body: any,
    fallbackModel: string
  ): ContentCreatorLlmCompletion {
    const content = body?.choices?.[0]?.message?.content;
    const text = this.normalizeContent(content);
    if (!text) {
      throw new Error('Content Creator LLM returned an empty completion');
    }

    return {
      text,
      model: body?.model || fallbackModel,
      usage: this.normalizeUsage(body?.usage),
    };
  }

  private parseResponsesApi(
    body: any,
    fallbackModel: string
  ): ContentCreatorLlmCompletion {
    const fromOutputText =
      typeof body?.output_text === 'string' ? body.output_text : '';
    const fromOutput = Array.isArray(body?.output)
      ? body.output
          .flatMap((item: any) => item?.content || [])
          .map((part: any) => part?.text)
          .filter((part: unknown) => typeof part === 'string')
          .join('\n')
      : '';
    const text = (fromOutputText || fromOutput).trim();
    if (!text) {
      throw new Error('Content Creator LLM returned an empty completion');
    }

    return {
      text,
      model: body?.model || fallbackModel,
      usage: this.normalizeUsage(body?.usage),
    };
  }

  private normalizeContent(content: unknown): string {
    if (typeof content === 'string') {
      return content.trim();
    }
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') {
            return part;
          }
          if (part && typeof part === 'object' && 'text' in part) {
            return String((part as { text?: string }).text || '');
          }
          return '';
        })
        .join('')
        .trim();
    }
    return '';
  }

  private normalizeUsage(usage: any): ContentCreatorLlmUsage {
    const promptTokens = Number(
      usage?.prompt_tokens ?? usage?.input_tokens ?? 0
    );
    const completionTokens = Number(
      usage?.completion_tokens ?? usage?.output_tokens ?? 0
    );
    const totalTokens = Number(
      usage?.total_tokens ?? promptTokens + completionTokens
    );

    return {
      promptTokens: Number.isFinite(promptTokens) ? promptTokens : 0,
      completionTokens: Number.isFinite(completionTokens)
        ? completionTokens
        : 0,
      totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
    };
  }

  private hostLabel(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return 'llm-host';
    }
  }

  private upstreamError(status: number, raw: string): Error {
    const snippet = (raw || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    return new Error(
      `Content Creator LLM request failed (${status})${
        snippet ? `: ${snippet}` : ''
      }`
    );
  }
}

export function parsePositiveInt(
  value: string | undefined,
  fallback: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}
