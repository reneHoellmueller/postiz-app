import { BadRequestException, NotFoundException } from '@nestjs/common';

jest.mock('@gitroom/nestjs-libraries/database/prisma/integrations/integration.service', () => ({
  IntegrationService: class IntegrationService {},
}));
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
}));

import { InboxService } from './inbox.service';

const template = {
  id: 'tpl-1',
  name: 'Demo-Account',
  body: 'Hier ist der Demo-Link: https://example.com/demo',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeService(overrides?: {
  template?: typeof template | null;
  provider?: Record<string, any>;
  integration?: Record<string, any> | null;
}) {
  const repo = {
    listTemplates: jest.fn().mockResolvedValue([template]),
    getTemplate: jest.fn().mockResolvedValue(
      overrides && 'template' in overrides ? overrides.template : template
    ),
    createTemplate: jest.fn().mockResolvedValue(template),
    updateTemplate: jest.fn().mockResolvedValue(template),
    deleteTemplate: jest.fn().mockResolvedValue({ id: 'tpl-1' }),
  };
  const integrationService = {
    getIntegrationById: jest.fn().mockResolvedValue(
      overrides && 'integration' in overrides
        ? overrides.integration
        : {
            id: 'ig-1',
            organizationId: 'org-1',
            providerIdentifier: 'instagram-standalone',
            token: 'secret-token',
            deletedAt: null,
            disabled: false,
            refreshNeeded: false,
          }
    ),
  };
  const provider = {
    listPostComments: jest.fn().mockResolvedValue([
      { id: 'c1', text: 'DEMO', canPrivateReply: true },
    ]),
    replyToComment: jest.fn().mockResolvedValue({ id: 'r1' }),
    privateReplyToComment: jest.fn().mockResolvedValue({ id: 'm1' }),
    listConversations: jest.fn().mockResolvedValue([]),
    listMessages: jest.fn().mockResolvedValue([]),
    sendMessage: jest.fn().mockResolvedValue({ id: 's1' }),
    ...(overrides?.provider || {}),
  };
  const manager = {
    getSocialIntegration: jest.fn().mockReturnValue(provider),
  };

  const service = new InboxService(
    repo as any,
    integrationService as any,
    manager as any
  );
  return { service, repo, integrationService, provider };
}

describe('InboxService', () => {
  it('lists comments through the generic provider interface', async () => {
    const { service, provider, integrationService } = makeService();
    const comments = await service.listComments('org-1', 'ig-1', '2026-10-01');
    expect(comments).toEqual([
      { id: 'c1', text: 'DEMO', canPrivateReply: true },
    ]);
    expect(provider.listPostComments).toHaveBeenCalledWith(
      'secret-token',
      expect.objectContaining({ id: 'ig-1' }),
      { since: '2026-10-01' }
    );
    expect(integrationService.getIntegrationById).toHaveBeenCalledWith(
      'org-1',
      'ig-1'
    );
  });

  it('sends a saved template as a private reply without returning the token', async () => {
    const { service, provider } = makeService();
    const result = await service.sendTemplate('org-1', 'tpl-1', {
      target: 'private-reply',
      integrationId: 'ig-1',
      commentId: 'c1',
    });
    expect(result).toEqual({ id: 'm1' });
    expect(provider.privateReplyToComment).toHaveBeenCalledWith(
      'secret-token',
      expect.any(Object),
      'c1',
      template.body
    );
    expect(JSON.stringify(result)).not.toContain('secret-token');
  });

  it('rejects channels that do not implement inbox methods', async () => {
    const { service } = makeService({
      provider: { listPostComments: undefined },
    });
    await expect(service.listComments('org-1', 'x-1')).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('uses a saved template as the public comment reply text', async () => {
    const { service, provider } = makeService();
    await service.replyToComment('org-1', 'ig-1', 'c1', undefined, 'tpl-1');
    expect(provider.replyToComment).toHaveBeenCalledWith(
      'secret-token',
      expect.any(Object),
      'c1',
      template.body
    );
  });

  it('refuses a channel that still needs reconnect', async () => {
    const { service } = makeService({
      integration: {
        id: 'ig-1',
        organizationId: 'org-1',
        providerIdentifier: 'instagram-standalone',
        token: 'secret-token',
        deletedAt: null,
        disabled: false,
        refreshNeeded: true,
      },
    });
    await expect(service.listComments('org-1', 'ig-1')).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('turns provider errors into BadRequestException without leaking the token', async () => {
    const { service } = makeService({
      provider: {
        listPostComments: jest.fn().mockRejectedValue(new Error('Meta said no')),
      },
    });
    await expect(service.listComments('org-1', 'ig-1')).rejects.toThrow(
      'Meta said no'
    );
  });

  it('rejects missing templates and integrations', async () => {
    const missingTemplate = makeService({ template: null });
    await expect(
      missingTemplate.service.sendTemplate('org-1', 'missing', {
        target: 'comment',
        integrationId: 'ig-1',
        commentId: 'c1',
      })
    ).rejects.toBeInstanceOf(NotFoundException);

    const missingIntegration = makeService({ integration: null });
    await expect(
      missingIntegration.service.listComments('org-1', 'missing')
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
