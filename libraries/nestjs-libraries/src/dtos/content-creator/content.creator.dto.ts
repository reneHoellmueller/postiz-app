import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const CONTENT_CREATOR_TYPES = ['post', 'dm', 'comment'] as const;
export const CONTENT_CREATOR_AUDIENCES = ['host', 'partner'] as const;

export type ContentCreatorType = (typeof CONTENT_CREATOR_TYPES)[number];
export type ContentCreatorAudience = (typeof CONTENT_CREATOR_AUDIENCES)[number];

export class ContentCreatorGenerateDto {
  @IsString()
  @IsIn(CONTENT_CREATOR_TYPES)
  type: ContentCreatorType;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  brief: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  context?: string;

  @IsOptional()
  @IsString()
  @IsIn(CONTENT_CREATOR_AUDIENCES)
  audience?: ContentCreatorAudience;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  maxLength?: number;
}

export class ContentCreatorGenerateResponseDto {
  text: string;
  hashtags?: string[];
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
