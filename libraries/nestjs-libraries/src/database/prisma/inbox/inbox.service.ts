import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InboxRepository } from '@gitroom/nestjs-libraries/database/prisma/inbox/inbox.repository';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import {
  ReplyTemplateDto,
  InboxSendTemplateDto,
} from '@gitroom/nestjs-libraries/dtos/inbox/inbox.dto';
import { Integration } from '@prisma/client';
import { SocialProvider } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';

@Injectable()
export class InboxService {
  constructor(
    private _inboxRepository: InboxRepository,
    private _integrationService: IntegrationService,
    private _integrationManager: IntegrationManager
  ) {}

  listTemplates(orgId: string) {
    return this._inboxRepository.listTemplates(orgId);
  }

  createTemplate(orgId: string, body: ReplyTemplateDto) {
    return this._inboxRepository.createTemplate(orgId, body);
  }

  async updateTemplate(orgId: string, id: string, body: ReplyTemplateDto) {
    const existing = await this._inboxRepository.getTemplate(orgId, id);
    if (!existing) {
      throw new NotFoundException('Template not found');
    }
    return this._inboxRepository.updateTemplate(id, body);
  }

  async deleteTemplate(orgId: string, id: string) {
    const existing = await this._inboxRepository.getTemplate(orgId, id);
    if (!existing) {
      throw new NotFoundException('Template not found');
    }
    return this._inboxRepository.deleteTemplate(id);
  }

  async listComments(orgId: string, integrationId: string, since?: string) {
    const { integration, provider } = await this.loadInboxProvider(
      orgId,
      integrationId,
      'listPostComments'
    );
    return this.runProvider(() =>
      provider.listPostComments(integration.token, integration, { since })
    );
  }

  async replyToComment(
    orgId: string,
    integrationId: string,
    commentId: string,
    message?: string,
    templateId?: string
  ) {
    const text = await this.resolveMessage(orgId, message, templateId);
    const { integration, provider } = await this.loadInboxProvider(
      orgId,
      integrationId,
      'replyToComment'
    );
    return this.runProvider(() =>
      provider.replyToComment(
        integration.token,
        integration,
        commentId,
        text
      )
    );
  }

  async privateReplyToComment(
    orgId: string,
    integrationId: string,
    commentId: string,
    message?: string,
    templateId?: string
  ) {
    const text = await this.resolveMessage(orgId, message, templateId);
    const { integration, provider } = await this.loadInboxProvider(
      orgId,
      integrationId,
      'privateReplyToComment'
    );
    return this.runProvider(() =>
      provider.privateReplyToComment(
        integration.token,
        integration,
        commentId,
        text
      )
    );
  }

  async listConversations(orgId: string, integrationId: string) {
    const { integration, provider } = await this.loadInboxProvider(
      orgId,
      integrationId,
      'listConversations'
    );
    return this.runProvider(() =>
      provider.listConversations(integration.token, integration)
    );
  }

  async listMessages(
    orgId: string,
    integrationId: string,
    conversationId: string
  ) {
    const { integration, provider } = await this.loadInboxProvider(
      orgId,
      integrationId,
      'listMessages'
    );
    return this.runProvider(() =>
      provider.listMessages(
        integration.token,
        integration,
        conversationId
      )
    );
  }

  async sendMessage(
    orgId: string,
    integrationId: string,
    recipientId: string,
    message?: string,
    templateId?: string
  ) {
    const text = await this.resolveMessage(orgId, message, templateId);
    const { integration, provider } = await this.loadInboxProvider(
      orgId,
      integrationId,
      'sendMessage'
    );
    return this.runProvider(() =>
      provider.sendMessage(
        integration.token,
        integration,
        recipientId,
        text
      )
    );
  }

  async sendTemplate(orgId: string, id: string, body: InboxSendTemplateDto) {
    const template = await this._inboxRepository.getTemplate(orgId, id);
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (body.target === 'comment') {
      if (!body.commentId) {
        throw new BadRequestException('commentId is required');
      }
      return this.replyToComment(
        orgId,
        body.integrationId,
        body.commentId,
        template.body
      );
    }

    if (body.target === 'private-reply') {
      if (!body.commentId) {
        throw new BadRequestException('commentId is required');
      }
      return this.privateReplyToComment(
        orgId,
        body.integrationId,
        body.commentId,
        template.body
      );
    }

    if (!body.recipientId) {
      throw new BadRequestException('recipientId is required');
    }
    return this.sendMessage(
      orgId,
      body.integrationId,
      body.recipientId,
      template.body
    );
  }

  private async runProvider<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Inbox request failed'
      );
    }
  }

  private async resolveMessage(
    orgId: string,
    message?: string,
    templateId?: string
  ) {
    if (!templateId) {
      if (!message?.trim()) {
        throw new BadRequestException('message is required');
      }
      return message;
    }
    const template = await this._inboxRepository.getTemplate(orgId, templateId);
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    return template.body;
  }

  private async loadInboxProvider(
    orgId: string,
    integrationId: string,
    method:
      | 'listPostComments'
      | 'replyToComment'
      | 'privateReplyToComment'
      | 'listConversations'
      | 'listMessages'
      | 'sendMessage'
  ): Promise<{ integration: Integration; provider: SocialProvider }> {
    const integration = await this._integrationService.getIntegrationById(
      orgId,
      integrationId
    );
    if (!integration || integration.deletedAt) {
      throw new NotFoundException('Integration not found');
    }
    if (integration.disabled || integration.refreshNeeded) {
      throw new BadRequestException(
        'This channel needs to be reconnected before inbox can be used'
      );
    }

    const provider = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );
    if (!provider?.[method]) {
      throw new BadRequestException(
        'Inbox is not supported for this channel'
      );
    }

    return { integration, provider };
  }
}
