import { Logger } from '@nestjs/common';
import {
  ContentCreatorLlmClient,
  DEFAULT_CONTENT_CREATOR_MAX_TOKENS,
  DEFAULT_CONTENT_CREATOR_MODEL,
  DEFAULT_OPENAI_API_URL,
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
    restoreEnv('CONTENT_CREATOR_MAX_TOKENS', originalEnv.CONTENT_CREATOR_MAX_TOKENS);
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('caps output tokens from env and maxLength', () => {
    const client = new ContentCreatorLlmClient();
    expect(client.resolveMaxTokens()).toBe(DEFAULT_CONTENT_CREATOR_MAX_TOKENS);
    process.env.CONTENT_CREATOR_MAX_TOKENS = '400';
    expect(client.resolveMaxTokens()).toBe(400);
    expect(client.resolveMaxTokens(40)).toBe(68);
    expect(client.resolveModel()).toBe(DEFAULT_CONTENT_CREATOR_MODEL);
    process.env.CONTENT_CREATOR_MODEL = 'my-proxy-model';
    expect(client.resolveModel()).toBe('my-proxy-model');
  });

  it('normalizes the OpenAI base URL', () => {
    const client = new ContentCreatorLlmClient();
    expect(client.resolveBaseUrl(undefined)).toBe(DEFAULT_OPENAI_API_URL);
    expect(client.resolveBaseUrl('https://api.openai.com')).toBe(
      'https://api.openai.com/v1'
    );
    expect(client.resolveBaseUrl('https://proxy.example/v1/')).toBe(
      'https://proxy.example/v1'
    );
  });

  it('calls an OpenAI-compatible chat API and never logs the key', async () => {
    process.env.OPENAI_API_KEY = 'sk-never-log-this-key';
    process.env.OPENAI_API_URL = 'https://llm.example/v1';
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          model: 'gpt-5.6-sol',
          choices: [
            {
              message: {
                content: '{"text":"Guten Tag","hashtags":[]}',
              },
            },
          ],
          usage: {
            prompt_tokens: 11,
            completion_tokens: 5,
            total_tokens: 16,
          },
        }),
    });
    global.fetch = fetchMock as any;

    const client = new ContentCreatorLlmClient();
    const result = await client.complete({
      system: 'system',
      user: 'user',
      maxTokens: 80,
      model: 'gpt-5.6-sol',
    });

    expect(result).toEqual({
      text: '{"text":"Guten Tag","hashtags":[]}',
      model: 'gpt-5.6-sol',
      usage: { promptTokens: 11, completionTokens: 5, totalTokens: 16 },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://llm.example/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
      })
    );
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer sk-never-log-this-key');
    const logged = [...errorSpy.mock.calls, ...logSpy.mock.calls]
      .map((call) => call.join(' '))
      .join(' ');
    expect(logged).not.toContain('sk-never-log-this-key');
  });

  it('retries chat completions with max_completion_tokens after a 400', async () => {
    process.env.OPENAI_API_KEY = 'sk-never-log-this-key';
    const fetchMock = jest
      .fn()
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
            model: 'gpt-5.6-sol',
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
      model: 'gpt-5.6-sol',
    });

    expect(result.text).toBe('Mit max_completion_tokens');
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(firstBody.max_tokens).toBe(80);
    expect(secondBody.max_completion_tokens).toBe(80);
    expect(secondBody.max_tokens).toBeUndefined();
  });

  it('falls back to the Responses API when chat completions is missing', async () => {
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
            model: 'gpt-5.6-sol',
            output_text: 'Antwort per Responses API',
            usage: { input_tokens: 3, output_tokens: 4, total_tokens: 7 },
          }),
      });
    global.fetch = fetchMock as any;

    const client = new ContentCreatorLlmClient();
    const result = await client.complete({
      system: 'system',
      user: 'user',
      maxTokens: 80,
      model: 'gpt-5.6-sol',
    });

    expect(result.text).toBe('Antwort per Responses API');
    expect(fetchMock.mock.calls[1][0]).toContain('/responses');
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
