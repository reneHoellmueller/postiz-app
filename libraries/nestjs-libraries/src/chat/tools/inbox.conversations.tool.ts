import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { InboxService } from '@gitroom/nestjs-libraries/database/prisma/inbox/inbox.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class InboxConversationsTool implements AgentToolInterface {
  constructor(private _inboxService: InboxService) {}
  name = 'inboxConversationsTool';

  run() {
    return createTool({
      id: 'inboxConversationsTool',
      mcp: {
        annotations: {
          title: 'List DM conversations or messages',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      description: `
List Instagram or Facebook Page DM conversations for a channel.
If conversationId is passed, list messages in that conversation instead.
Replies are only allowed inside Meta's 24-hour window after the person wrote last (or as a one-time private reply to a comment).
`,
      inputSchema: z.object({
        integrationId: z.string(),
        conversationId: z
          .string()
          .optional()
          .describe('When set, list messages in this conversation'),
      }),
      outputSchema: z.object({
        output: z.any(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;
        if (inputData.conversationId) {
          return {
            output: await this._inboxService.listMessages(
              organizationId,
              inputData.integrationId,
              inputData.conversationId
            ),
          };
        }
        return {
          output: await this._inboxService.listConversations(
            organizationId,
            inputData.integrationId
          ),
        };
      },
    });
  }
}
