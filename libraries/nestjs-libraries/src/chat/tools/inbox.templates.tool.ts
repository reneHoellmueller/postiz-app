import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { InboxService } from '@gitroom/nestjs-libraries/database/prisma/inbox/inbox.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class InboxTemplatesTool implements AgentToolInterface {
  constructor(private _inboxService: InboxService) {}
  name = 'inboxTemplatesTool';

  run() {
    return createTool({
      id: 'inboxTemplatesTool',
      mcp: {
        annotations: {
          title: 'Manage reply templates',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      description: `
List, create, update, delete, or send saved reply templates (for example a demo-account text).
action "send" needs integrationId plus commentId (for comment / private-reply) or recipientId (for message).
`,
      inputSchema: z.object({
        action: z
          .enum(['list', 'create', 'update', 'delete', 'send'])
          .default('list'),
        id: z.string().optional(),
        name: z.string().optional(),
        body: z.string().optional(),
        target: z.enum(['comment', 'private-reply', 'message']).optional(),
        integrationId: z.string().optional(),
        commentId: z.string().optional(),
        recipientId: z.string().optional(),
      }),
      outputSchema: z.object({
        output: z.any(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;

        if (inputData.action === 'list') {
          return { output: await this._inboxService.listTemplates(organizationId) };
        }
        if (inputData.action === 'create') {
          return {
            output: await this._inboxService.createTemplate(organizationId, {
              name: inputData.name || 'Template',
              body: inputData.body || '',
            }),
          };
        }
        if (inputData.action === 'update' && inputData.id) {
          return {
            output: await this._inboxService.updateTemplate(
              organizationId,
              inputData.id,
              {
                name: inputData.name || 'Template',
                body: inputData.body || '',
              }
            ),
          };
        }
        if (inputData.action === 'delete' && inputData.id) {
          return {
            output: await this._inboxService.deleteTemplate(
              organizationId,
              inputData.id
            ),
          };
        }
        if (inputData.action === 'send' && inputData.id) {
          return {
            output: await this._inboxService.sendTemplate(
              organizationId,
              inputData.id,
              {
                target: inputData.target || 'private-reply',
                integrationId: inputData.integrationId || '',
                commentId: inputData.commentId,
                recipientId: inputData.recipientId,
              }
            ),
          };
        }
        return { output: { error: 'Invalid template action' } };
      },
    });
  }
}
