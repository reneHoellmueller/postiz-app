import { IsDefined, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class InboxReplyDto {
  @IsString()
  @IsOptional()
  message?: string;

  @IsString()
  @IsOptional()
  templateId?: string;
}

export class InboxSendMessageDto {
  @IsString()
  @IsOptional()
  message?: string;

  @IsString()
  @IsOptional()
  recipientId?: string;

  @IsString()
  @IsOptional()
  templateId?: string;
}

export class ReplyTemplateDto {
  @IsString()
  @IsDefined()
  @MinLength(1)
  name: string;

  @IsString()
  @IsDefined()
  @MinLength(1)
  body: string;
}

export class InboxSendTemplateDto {
  @IsString()
  @IsDefined()
  @IsIn(['comment', 'private-reply', 'message'])
  target: 'comment' | 'private-reply' | 'message';

  @IsString()
  @IsDefined()
  integrationId: string;

  @IsString()
  @IsOptional()
  commentId?: string;

  @IsString()
  @IsOptional()
  conversationId?: string;

  @IsString()
  @IsOptional()
  recipientId?: string;
}
