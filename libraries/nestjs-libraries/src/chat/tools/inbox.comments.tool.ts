import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { InboxService } from '@gitroom/nestjs-libraries/database/prisma/inbox/inbox.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class InboxCommentsTool implements AgentToolInterface {
  constructor(private _inboxService: InboxService) {}
  name = 'inboxCommentsTool';

  run() {
    return createTool({
      id: 'inboxCommentsTool',
      mcp: {
        annotations: {
          title: 'List post comments',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      description: `
List comments on Instagram or Facebook Page posts for one connected channel.
Requires the channel to have been reconnected after inbox scopes were added.
Optional "since" (ISO UTC) filters out older comments.
Does not return access tokens.
`,
      inputSchema: z.object({
        integrationId: z.string().describe('Channel id from integrationList'),
        since: z
          .string()
          .optional()
          .describe('Only comments at or after this UTC time'),
      }),
      outputSchema: z.object({
        output: z.array(
          z.object({
            id: z.string(),
            text: z.string(),
            fromName: z.string().optional(),
            createdAt: z.string().optional(),
            canPrivateReply: z.boolean(),
            mediaId: z.string().optional(),
            mediaPermalink: z.string().optional(),
          })
        ),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;
        const comments = await this._inboxService.listComments(
          organizationId,
          inputData.integrationId,
          inputData.since
        );
        return { output: comments };
      },
    });
  }
}
