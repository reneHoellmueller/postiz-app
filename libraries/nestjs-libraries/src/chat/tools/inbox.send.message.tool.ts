import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { InboxService } from '@gitroom/nestjs-libraries/database/prisma/inbox/inbox.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class InboxSendMessageTool implements AgentToolInterface {
  constructor(private _inboxService: InboxService) {}
  name = 'inboxSendMessageTool';

  run() {
    return createTool({
      id: 'inboxSendMessageTool',
      mcp: {
        annotations: {
          title: 'Send a DM reply',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      description: `
Send a DM on Instagram or a Facebook Page. recipientId is the Instagram-scoped or page-scoped user id from inboxConversationsTool.
This cannot start a new conversation. The person must have written first (or you already sent a private reply to their comment).
`,
      inputSchema: z.object({
        integrationId: z.string(),
        recipientId: z.string(),
        message: z.string().optional(),
        templateId: z.string().optional(),
      }),
      outputSchema: z.object({
        output: z.object({
          id: z.string(),
        }),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;
        return {
          output: await this._inboxService.sendMessage(
            organizationId,
            inputData.integrationId,
            inputData.recipientId,
            inputData.message || '',
            inputData.templateId
          ),
        };
      },
    });
  }
}
