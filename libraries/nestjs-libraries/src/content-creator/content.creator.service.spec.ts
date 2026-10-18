import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ContentCreatorService } from './content.creator.service';
import {
  CONTENT_CREATOR_BRAND_PROMPT,
  CONTENT_CREATOR_BRAND_URL,
} from './brand.prompt';

function makeService(complete?: jest.Mock) {
  const llm = {
    complete: complete || jest.fn(),
    resolveModel: jest.fn().mockReturnValue('gpt-5-mini'),
    resolveMaxTokens: jest.fn().mockReturnValue(800),
  };
  const service = new ContentCreatorService(llm as any);
  return { service, llm };
}

describe('ContentCreatorService', () => {
  const originalKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalKey;
    }
    jest.restoreAllMocks();
  });

  it('returns 503 when OPENAI_API_KEY is missing and does not call the LLM', async () => {
    delete process.env.OPENAI_API_KEY;
    const { service, llm } = makeService();

    try {
      await service.generate({ type: 'post', brief: 'Check-in erklären' });
      throw new Error('expected generate to fail');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(
        HttpStatus.SERVICE_UNAVAILABLE
      );
      expect((err as HttpException).getResponse()).toEqual({
        msg: expect.stringContaining('OPENAI_API_KEY'),
      });
    }
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('maps a mocked LLM completion to text, hashtags, model and usage', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-secret-key';
    const complete = jest.fn().mockResolvedValue({
      text: '{"text":"Automatisieren Sie Check-in und Meldewesen.","hashtags":["#Ferienwohnung","Gastgeber"]}',
      model: 'gpt-5-mini',
      usage: { promptTokens: 120, completionTokens: 40, totalTokens: 160 },
    });
    const { service, llm } = makeService(complete);

    const result = await service.generate({
      type: 'post',
      brief: 'Kurz erklären, warum Check-in und Meldewesen zusammengehören',
      audience: 'host',
      tone: 'ruhig und klar',
      maxLength: 280,
    });

    expect(result).toEqual({
      text: 'Automatisieren Sie Check-in und Meldewesen.',
      hashtags: ['#Ferienwohnung', '#Gastgeber'],
      model: 'gpt-5-mini',
      usage: { promptTokens: 120, completionTokens: 40, totalTokens: 160 },
    });
    expect(llm.resolveMaxTokens).toHaveBeenCalledWith(280);
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5-mini',
        maxTokens: 800,
      })
    );

    const { system, user } = complete.mock.calls[0][0];
    expect(system).toContain(CONTENT_CREATOR_BRAND_PROMPT);
    expect(system).toContain(CONTENT_CREATOR_BRAND_URL);
    expect(system).toContain('Gastgeberinnen und Gastgeber');
    expect(user).toContain('type: post');
    expect(user).toContain('audience: host');
    expect(user).toContain('Check-in und Meldewesen');
  });

  it('omits hashtags for DM replies and uses Sie-form instructions', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-secret-key';
    const complete = jest.fn().mockResolvedValue({
      text: '{"text":"Gern, ich sende Ihnen den Link: https://www.myguestpage.app","hashtags":["#spam"]}',
      model: 'gpt-5-mini',
      usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 },
    });
    const { service } = makeService(complete);

    const result = await service.generate({
      type: 'dm',
      brief: 'Demo-Zugang anbieten',
      context: 'Haben Sie einen Demo-Account?',
      audience: 'partner',
    });

    expect(result.text).toContain('myguestpage.app');
    expect(result.hashtags).toBeUndefined();
    expect(complete.mock.calls[0][0].system).toContain('Sie-Form');
    expect(complete.mock.calls[0][0].user).toContain(
      'Haben Sie einen Demo-Account?'
    );
  });

  it('turns LLM errors into 502 without logging the API key', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-secret-key';
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const complete = jest.fn().mockRejectedValue(new Error('upstream timeout'));
    const { service } = makeService(complete);

    try {
      await service.generate({
        type: 'comment',
        brief: 'Danke für die Nachricht',
      });
      throw new Error('expected generate to fail');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_GATEWAY);
    }

    const logged = errorSpy.mock.calls.map((call) => call.join(' ')).join(' ');
    expect(logged).not.toContain('sk-test-secret-key');
    expect(logged).toContain('upstream timeout');
  });

  it('parses plain-text captions with a trailing hashtag line', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-secret-key';
    const complete = jest.fn().mockResolvedValue({
      text: 'Check-in ohne Papierkram.\n\n#Meldewesen #Gastgeber',
      model: 'custom-model',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });
    const { service } = makeService(complete);

    const result = await service.generate({
      type: 'post',
      brief: 'Papierkram beim Check-in',
    });

    expect(result.text).toBe('Check-in ohne Papierkram.');
    expect(result.hashtags).toEqual(['#Meldewesen', '#Gastgeber']);
    expect(result.model).toBe('custom-model');
  });
});
