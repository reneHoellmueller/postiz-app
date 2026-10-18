import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ContentCreatorService } from '@gitroom/nestjs-libraries/content-creator/content.creator.service';
import { ContentCreatorGenerateDto } from '@gitroom/nestjs-libraries/dtos/content-creator/content.creator.dto';
import { parsePositiveInt } from '@gitroom/nestjs-libraries/content-creator/content.creator.llm.client';

@Controller('/content-creator')
export class ContentCreatorController {
  constructor(private _contentCreatorService: ContentCreatorService) {}

  @Post('/generate')
  @Throttle({
    default: {
      limit: parsePositiveInt(process.env.CONTENT_CREATOR_RATE_LIMIT, 20),
      ttl: 3600000,
    },
  })
  generate(@Body() body: ContentCreatorGenerateDto) {
    return this._contentCreatorService.generate(body);
  }
}
