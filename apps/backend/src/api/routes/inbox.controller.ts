import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { InboxService } from '@gitroom/nestjs-libraries/database/prisma/inbox/inbox.service';
import {
  InboxReplyDto,
  InboxSendMessageDto,
  InboxSendTemplateDto,
  ReplyTemplateDto,
} from '@gitroom/nestjs-libraries/dtos/inbox/inbox.dto';

@Controller('/inbox')
export class InboxController {
  constructor(private _inboxService: InboxService) {}

  private requireIntegration(integrationId?: string) {
    if (!integrationId) {
      throw new BadRequestException('integrationId is required');
    }
    return integrationId;
  }

  @Get('/templates')
  listTemplates(@GetOrgFromRequest() org: Organization) {
    return this._inboxService.listTemplates(org.id);
  }

  @Post('/templates')
  createTemplate(
    @GetOrgFromRequest() org: Organization,
    @Body() body: ReplyTemplateDto
  ) {
    return this._inboxService.createTemplate(org.id, body);
  }

  @Put('/templates/:id')
  updateTemplate(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: ReplyTemplateDto
  ) {
    return this._inboxService.updateTemplate(org.id, id, body);
  }

  @Delete('/templates/:id')
  deleteTemplate(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._inboxService.deleteTemplate(org.id, id);
  }

  @Post('/templates/:id/send')
  sendTemplate(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: InboxSendTemplateDto
  ) {
    return this._inboxService.sendTemplate(org.id, id, body);
  }

  @Get('/comments')
  listComments(
    @GetOrgFromRequest() org: Organization,
    @Query('integrationId') integrationId: string,
    @Query('since') since?: string
  ) {
    return this._inboxService.listComments(
      org.id,
      this.requireIntegration(integrationId),
      since
    );
  }

  @Post('/comments/:commentId/reply')
  replyToComment(
    @GetOrgFromRequest() org: Organization,
    @Param('commentId') commentId: string,
    @Query('integrationId') integrationId: string,
    @Body() body: InboxReplyDto
  ) {
    return this._inboxService.replyToComment(
      org.id,
      this.requireIntegration(integrationId),
      commentId,
      body.message,
      body.templateId
    );
  }

  @Post('/comments/:commentId/private-reply')
  privateReplyToComment(
    @GetOrgFromRequest() org: Organization,
    @Param('commentId') commentId: string,
    @Query('integrationId') integrationId: string,
    @Body() body: InboxReplyDto
  ) {
    return this._inboxService.privateReplyToComment(
      org.id,
      this.requireIntegration(integrationId),
      commentId,
      body.message,
      body.templateId
    );
  }

  @Get('/conversations')
  listConversations(
    @GetOrgFromRequest() org: Organization,
    @Query('integrationId') integrationId: string
  ) {
    return this._inboxService.listConversations(
      org.id,
      this.requireIntegration(integrationId)
    );
  }

  @Get('/conversations/:conversationId/messages')
  listMessages(
    @GetOrgFromRequest() org: Organization,
    @Param('conversationId') conversationId: string,
    @Query('integrationId') integrationId: string
  ) {
    return this._inboxService.listMessages(
      org.id,
      this.requireIntegration(integrationId),
      conversationId
    );
  }

  @Post('/conversations/:conversationId/messages')
  sendMessage(
    @GetOrgFromRequest() org: Organization,
    @Param('conversationId') conversationId: string,
    @Query('integrationId') integrationId: string,
    @Body() body: InboxSendMessageDto
  ) {
    if (!body.recipientId) {
      throw new BadRequestException('recipientId is required');
    }
    return this._inboxService.sendMessage(
      org.id,
      this.requireIntegration(integrationId),
      body.recipientId,
      body.message,
      body.templateId
    );
  }
}
