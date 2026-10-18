import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  ContentCreatorGenerateDto,
  ContentCreatorGenerateResponseDto,
} from '@gitroom/nestjs-libraries/dtos/content-creator/content.creator.dto';
import {
  CONTENT_CREATOR_BRAND_PROMPT,
  CONTENT_CREATOR_BRAND_URL,
} from '@gitroom/nestjs-libraries/content-creator/brand.prompt';
import { ContentCreatorLlmClient } from '@gitroom/nestjs-libraries/content-creator/content.creator.llm.client';

@Injectable()
export class ContentCreatorService {
  private readonly _logger = new Logger(ContentCreatorService.name);

  constructor(private _llm: ContentCreatorLlmClient) {}

  async generate(
    body: ContentCreatorGenerateDto
  ): Promise<ContentCreatorGenerateResponseDto> {
    if (!process.env.OPENAI_API_KEY?.trim()) {
      throw new HttpException(
        {
          msg: 'Content Creator is not configured. Set OPENAI_API_KEY to enable text generation.',
        },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    const model = this._llm.resolveModel();
    const maxTokens = this._llm.resolveMaxTokens(body.maxLength);

    try {
      const completion = await this._llm.complete({
        system: this.buildSystemPrompt(body),
        user: this.buildUserPrompt(body),
        maxTokens,
        model,
      });

      const parsed = parseGeneratedContent(completion.text);
      const text = enforceMaxLength(parsed.text, body.maxLength);
      const hashtags =
        body.type === 'post' && parsed.hashtags?.length
          ? parsed.hashtags
          : undefined;

      this._logger.log(
        `Content Creator generated type=${body.type} model=${completion.model} tokens=${completion.usage.totalTokens}`
      );

      return {
        text,
        ...(hashtags ? { hashtags } : {}),
        model: completion.model || model,
        usage: completion.usage,
      };
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }

      const message = err instanceof Error ? err.message : 'Unknown LLM error';
      this._logger.error(`Content Creator generation failed: ${message}`);

      if (message === 'OPENAI_API_KEY is not set') {
        throw new HttpException(
          {
            msg: 'Content Creator is not configured. Set OPENAI_API_KEY to enable text generation.',
          },
          HttpStatus.SERVICE_UNAVAILABLE
        );
      }

      throw new HttpException(
        {
          msg: 'Content Creator could not generate text. Please try again later.',
        },
        HttpStatus.BAD_GATEWAY
      );
    }
  }

  buildSystemPrompt(body: ContentCreatorGenerateDto): string {
    const typeHint =
      body.type === 'post'
        ? 'Erzeuge eine fertige Caption für Instagram/Facebook.'
        : body.type === 'dm'
        ? 'Erzeuge eine fertige Direktnachricht in der Sie-Form.'
        : 'Erzeuge eine fertige Kommentarantwort in der Sie-Form.';

    const audienceHint =
      body.audience === 'partner'
        ? 'Zielgruppe: touristische Partner.'
        : body.audience === 'host'
        ? 'Zielgruppe: Gastgeberinnen und Gastgeber.'
        : 'Zielgruppe: je nach Briefing Gastgeber oder Partner; im Zweifel Gastgeber.';

    const toneHint = body.tone?.trim()
      ? `Gewünschte Tonalität: ${body.tone.trim()}.`
      : '';
    const lengthHint = body.maxLength
      ? `Maximale Länge des Textes: ${body.maxLength} Zeichen (Hashtags zählen nicht).`
      : '';

    return [
      CONTENT_CREATOR_BRAND_PROMPT,
      typeHint,
      audienceHint,
      toneHint,
      lengthHint,
      `Falls ein Link sinnvoll ist, verwende ausschließlich ${CONTENT_CREATOR_BRAND_URL}.`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  buildUserPrompt(body: ContentCreatorGenerateDto): string {
    const lines = [`type: ${body.type}`];
    if (body.audience) {
      lines.push(`audience: ${body.audience}`);
    }
    if (body.tone?.trim()) {
      lines.push(`tone: ${body.tone.trim()}`);
    }
    if (body.maxLength) {
      lines.push(`maxLength: ${body.maxLength}`);
    }
    lines.push('', 'Briefing:', body.brief.trim());
    if (body.context?.trim()) {
      lines.push(
        '',
        'Kontext (eingehende Nachricht oder Kommentar):',
        body.context.trim()
      );
    }
    return lines.join('\n');
  }
}

export function parseGeneratedContent(raw: string): {
  text: string;
  hashtags?: string[];
} {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return { text: '' };
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed?.text === 'string' && parsed.text.trim()) {
        return {
          text: parsed.text.trim(),
          hashtags: normalizeHashtags(parsed.hashtags),
        };
      }
    } catch {
      // Model returned braces that are not JSON; keep the raw text.
    }
  }

  return splitTextAndHashtags(trimmed);
}

export function normalizeHashtags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const tags = value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (item.startsWith('#') ? item : `#${item}`));

  return tags.length ? Array.from(new Set(tags)) : undefined;
}

export function splitTextAndHashtags(raw: string): {
  text: string;
  hashtags?: string[];
} {
  const lines = raw.split(/\n/);
  const tagLine = [...lines].reverse().find((line) => {
    const parts = line.trim().split(/\s+/);
    return parts.length > 0 && parts.every((part) => part.startsWith('#'));
  });

  if (!tagLine) {
    return { text: raw };
  }

  const hashtags = normalizeHashtags(tagLine.trim().split(/\s+/));
  const text = lines
    .filter((line) => line !== tagLine)
    .join('\n')
    .trim();

  return { text: text || raw, hashtags };
}

export function enforceMaxLength(text: string, maxLength?: number): string {
  if (!maxLength || text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength).trimEnd();
}
