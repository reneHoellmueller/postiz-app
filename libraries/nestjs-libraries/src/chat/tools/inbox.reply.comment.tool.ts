import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { InboxService } from '@gitroom/nestjs-libraries/database/prisma/inbox/inbox.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class InboxReplyCommentTool implements AgentToolInterface {
  constructor(private _inboxService: InboxService) {}
  name = 'inboxReplyCommentTool';

  run() {
    return createTool({
      id: 'inboxReplyCommentTool',
      mcp: {
        annotations: {
          title: 'Reply to a comment',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      description: `
Reply to a comment on an Instagram or Facebook Page post.
type "public" posts a visible comment reply.
type "private" sends one DM (private reply) for that comment, allowed once within 7 days.
You cannot start a cold conversation. Pass message text or a saved templateId.
`,
      inputSchema: z.object({
        integrationId: z.string(),
        commentId: z.string(),
        type: z.enum(['public', 'private']).default('public'),
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
        const result =
          inputData.type === 'private'
            ? await this._inboxService.privateReplyToComment(
                organizationId,
                inputData.integrationId,
                inputData.commentId,
                inputData.message || '',
                inputData.templateId
              )
            : await this._inboxService.replyToComment(
                organizationId,
                inputData.integrationId,
                inputData.commentId,
                inputData.message || '',
                inputData.templateId
              );
        return { output: result };
      },
    });
  }
}
