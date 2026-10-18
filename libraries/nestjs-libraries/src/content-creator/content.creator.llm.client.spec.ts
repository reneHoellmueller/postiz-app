import { Logger } from '@nestjs/common';
import {
  ContentCreatorLlmClient,
  DEFAULT_CONTENT_CREATOR_MAX_TOKENS,
  DEFAULT_CONTENT_CREATOR_MODEL,
  DEFAULT_OPENAI_API_URL,
  readResponsesOutputText,
} from './content.creator.llm.client';

describe('ContentCreatorLlmClient', () => {
  const originalEnv = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_API_URL: process.env.OPENAI_API_URL,
    CONTENT_CREATOR_MODEL: process.env.CONTENT_CREATOR_MODEL,
    CONTENT_CREATOR_MAX_TOKENS: process.env.CONTENT_CREATOR_MAX_TOKENS,
  };
  const originalFetch = global.fetch;

  afterEach(() => {
    restoreEnv('OPENAI_API_KEY', originalEnv.OPENAI_API_KEY);
    restoreEnv('OPENAI_API_URL', originalEnv.OPENAI_API_URL);
    restoreEnv('CONTENT_CREATOR_MODEL', originalEnv.CONTENT_CREATOR_MODEL);
    restoreEnv(
      'CONTENT_CREATOR_MAX_TOKENS',
      originalEnv.CONTENT_CREATOR_MAX_TOKENS
    );
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('caps output tokens from env and maxLength', () => {
    const client = new ContentCreatorLlmClient();
    expect(client.resolveMaxTokens()).toBe(DEFAULT_CONTENT_CREATOR_MAX_TOKENS);
    process.env.CONTENT_CREATOR_MAX_TOKENS = '400';
    expect(client.resolveMaxTokens()).toBe(400);
    expect(client.resolveMaxTokens(40)).toBe(68);
    expect(client.resolveModel()).toBe('gpt-5-mini');
    expect(DEFAULT_CONTENT_CREATOR_MODEL).toBe('gpt-5-mini');
    process.env.CONTENT_CREATOR_MODEL = 'my-proxy-model';
    expect(client.resolveModel()).toBe('my-proxy-model');
  });

  it('defaults to the Azure AI Foundry v1 base URL', () => {
    const client = new ContentCreatorLlmClient();
    expect(client.resolveBaseUrl(undefined)).toBe(DEFAULT_OPENAI_API_URL);
    expect(DEFAULT_OPENAI_API_URL).toBe(
      'https://MyguestpageBrain.services.ai.azure.com/openai/v1'
    );
    expect(client.resolveBaseUrl('https://api.openai.com')).toBe(
      'https://api.openai.com/v1'
    );
    expect(client.resolveBaseUrl('https://proxy.example/v1/')).toBe(
      'https://proxy.example/v1'
    );
  });

  it('posts to the Azure Foundry /responses URL when OPENAI_API_URL is unset', async () => {
    process.env.OPENAI_API_KEY = 'sk-never-log-this-key';
    delete process.env.OPENAI_API_URL;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          model: 'gpt-5-mini',
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: 'ok' }],
            },
          ],
        }),
    });
    global.fetch = fetchMock as any;

    await new ContentCreatorLlmClient().complete({
      system: 'system',
      user: 'user',
      maxTokens: 32,
      model: 'gpt-5-mini',
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://MyguestpageBrain.services.ai.azure.com/openai/v1/responses'
    );
  });

  it('calls the Responses API first with dual auth headers and no temperature', async () => {
    process.env.OPENAI_API_KEY = 'sk-never-log-this-key';
    process.env.OPENAI_API_URL = 'https://llm.example/v1';
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          model: 'gpt-5-mini',
          output_text: '{"text":"Guten Tag","hashtags":[]}',
          usage: {
            input_tokens: 11,
            output_tokens: 5,
            total_tokens: 16,
          },
        }),
    });
    global.fetch = fetchMock as any;

    const client = new ContentCreatorLlmClient();
    const result = await client.complete({
      system: 'brand-system-prompt',
      user: 'brief and context',
      maxTokens: 80,
      model: 'gpt-5-mini',
    });

    expect(result).toEqual({
      text: '{"text":"Guten Tag","hashtags":[]}',
      model: 'gpt-5-mini',
      usage: { promptTokens: 11, completionTokens: 5, totalTokens: 16 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://llm.example/v1/responses',
      expect.objectContaining({
        method: 'POST',
      })
    );
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer sk-never-log-this-key');
    expect(options.headers['api-key']).toBe('sk-never-log-this-key');
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      model: 'gpt-5-mini',
      instructions: 'brand-system-prompt',
      input: 'brief and context',
      max_output_tokens: 80,
    });
    expect(body.temperature).toBeUndefined();
    const logged = [...errorSpy.mock.calls, ...logSpy.mock.calls]
      .map((call) => call.join(' '))
      .join(' ');
    expect(logged).not.toContain('sk-never-log-this-key');
  });

  it('reads output[].content[].text when output_text is missing', async () => {
    process.env.OPENAI_API_KEY = 'sk-never-log-this-key';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          model: 'gpt-5-mini',
          output: [
            { type: 'reasoning', content: [{ type: 'summary', text: 'think' }] },
            {
              type: 'message',
              content: [
                { type: 'output_text', text: 'Automatisieren Sie den Check-in.' },
              ],
            },
          ],
          usage: { input_tokens: 3, output_tokens: 4, total_tokens: 7 },
        }),
    });
    global.fetch = fetchMock as any;

    const client = new ContentCreatorLlmClient();
    const result = await client.complete({
      system: 'system',
      user: 'user',
      maxTokens: 80,
      model: 'gpt-5-mini',
    });

    expect(result.text).toBe('Automatisieren Sie den Check-in.');
    expect(result.text).not.toContain('think');
  });

  it('falls back to Chat Completions when Responses is missing', async () => {
    process.env.OPENAI_API_KEY = 'sk-never-log-this-key';
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'not found',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            model: 'gpt-5-mini',
            choices: [{ message: { content: 'Antwort per Chat Completions' } }],
            usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
          }),
      });
    global.fetch = fetchMock as any;

    const client = new ContentCreatorLlmClient();
    const result = await client.complete({
      system: 'system',
      user: 'user',
      maxTokens: 80,
      model: 'gpt-5-mini',
    });

    expect(result.text).toBe('Antwort per Chat Completions');
    expect(fetchMock.mock.calls[0][0]).toContain('/responses');
    expect(fetchMock.mock.calls[1][0]).toContain('/chat/completions');
    const chatBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(chatBody.temperature).toBeUndefined();
    expect(chatBody.max_tokens).toBe(80);
  });

  it('retries Chat Completions with max_completion_tokens after a 400', async () => {
    process.env.OPENAI_API_KEY = 'sk-never-log-this-key';
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'not found',
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Unsupported parameter: max_tokens',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            model: 'gpt-5-mini',
            choices: [{ message: { content: 'Mit max_completion_tokens' } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
      });
    global.fetch = fetchMock as any;

    const client = new ContentCreatorLlmClient();
    const result = await client.complete({
      system: 'system',
      user: 'user',
      maxTokens: 80,
      model: 'gpt-5-mini',
    });

    expect(result.text).toBe('Mit max_completion_tokens');
    const firstChat = JSON.parse(fetchMock.mock.calls[1][1].body);
    const secondChat = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(firstChat.max_tokens).toBe(80);
    expect(secondChat.max_completion_tokens).toBe(80);
    expect(secondChat.max_tokens).toBeUndefined();
    expect(secondChat.temperature).toBeUndefined();
  });

  it('does not fall back to Chat Completions on Responses 401', async () => {
    process.env.OPENAI_API_KEY = 'sk-never-log-this-key';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    });
    global.fetch = fetchMock as any;

    const client = new ContentCreatorLlmClient();
    await expect(
      client.complete({
        system: 'system',
        user: 'user',
        maxTokens: 80,
        model: 'gpt-5-mini',
      })
    ).rejects.toThrow(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/responses');
  });
});

describe('readResponsesOutputText', () => {
  it('prefers output_text, then output_text parts, then any content text', () => {
    expect(
      readResponsesOutputText({ output_text: '  Direkt  ' })
    ).toBe('Direkt');
    expect(
      readResponsesOutputText({
        output: [
          { type: 'reasoning', content: [{ type: 'output_text', text: 'skip' }] },
          {
            type: 'message',
            content: [
              { type: 'output_text', text: 'Teil A' },
              { type: 'output_text', text: 'Teil B' },
            ],
          },
        ],
      })
    ).toBe('Teil A\nTeil B');
    expect(
      readResponsesOutputText({
        output: [
          {
            type: 'message',
            content: [{ text: 'Azure ohne type' }],
          },
        ],
      })
    ).toBe('Azure ohne type');
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
