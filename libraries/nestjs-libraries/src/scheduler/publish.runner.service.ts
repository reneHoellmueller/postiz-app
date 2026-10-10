import { Injectable } from '@nestjs/common';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import {
  NotificationService,
  NotificationType,
} from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { Integration, Post } from '@prisma/client';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { timer } from '@gitroom/helpers/utils/timer';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import {
  BadBody,
  Disconnect,
  RefreshToken,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import {
  PostResponse,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { capitalize } from 'lodash';
import { STALE_LOCK_MESSAGE } from '@gitroom/nestjs-libraries/scheduler/scheduler.policy';

function slimPost(post: any) {
  if (!post) return post;
  const {
    error,
    childrenPost,
    tags,
    description,
    title,
    submittedForOrderId,
    submittedForOrganizationId,
    submittedForOrder,
    submittedForOrganization,
    lastMessageId,
    parentPostId,
    approvedSubmitForOrder,
    deletedAt,
    createdAt,
    updatedAt,
    payoutProblems,
    comments,
    errors,
    ...rest
  } = post;
  return rest;
}

const RETRY_ATTEMPTS = 3;
const PENDING_MAX_CHECKS = 90;

@Injectable()
export class PublishRunnerService {
  constructor(
    private _postService: PostsService,
    private _notificationService: NotificationService,
    private _integrationManager: IntegrationManager,
    private _integrationService: IntegrationService,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _webhookService: WebhooksService,
    private _subscriptionService: SubscriptionService
  ) {}

  async publishPost(orgId: string, postId: string) {
    const firstPost = await this._postService.getPostById(postId, orgId);
    if (!firstPost || firstPost.deletedAt) {
      await this._postService.changeState(postId, 'ERROR', 'No Post');
      return;
    }

    if (firstPost.state !== 'QUEUE') {
      return;
    }

    const postsListBefore = await this.getPostsList(orgId, postId);
    const [post] = postsListBefore;
    if (!post) {
      await this._postService.changeState(postId, 'ERROR', 'No Post');
      return;
    }

    if (post.integration?.refreshNeeded) {
      await this.inAppNotification(
        post.organizationId,
        `We couldn't post to ${post.integration?.providerIdentifier} for ${post?.integration?.name}`,
        `We couldn't post to ${post.integration?.providerIdentifier} for ${post?.integration?.name} because you need to reconnect it. Please enable it and try again.`,
        true,
        'info'
      );
      await this._postService.changeState(
        postsListBefore[0].id,
        'ERROR',
        'Refresh channel needed',
        postsListBefore
      );
      return;
    }

    if (post.integration?.disabled) {
      await this.inAppNotification(
        post.organizationId,
        `We couldn't post to ${post.integration?.providerIdentifier} for ${post?.integration?.name}`,
        `We couldn't post to ${post.integration?.providerIdentifier} for ${post?.integration?.name} because it's disabled. Please enable it and try again.`,
        true,
        'info'
      );
      await this._postService.changeState(
        postsListBefore[0].id,
        'ERROR',
        'Channel disabled',
        postsListBefore
      );
      return;
    }

    const provider = this._integrationManager.getSocialIntegration(
      post.integration.providerIdentifier
    );
    const toComment = postsListBefore.length > 1 && !!provider.comment;
    const postsList = toComment ? postsListBefore : [postsListBefore[0]];
    const postsResults: PostResponse[] = [];

    for (let i = 0; i < postsList.length; i++) {
      const before = postsResults.length;
      let posted = false;
      let updated = false;

      for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
        try {
          if (i === 0) {
            postsResults.push(
              ...(await this.postSocialPending(post.integration as Integration, [
                postsList[i],
              ]))
            );
          } else {
            if (postsList[i].delay) {
              await timer(60000 * Math.max(0, Number(postsList[i].delay ?? 0)));
            }
            postsResults.push(
              ...(await this.postComment(
                postsResults[0].postId,
                postsResults.length === 1
                  ? undefined
                  : postsResults[i - 1].postId,
                post.integration,
                [postsList[i]]
              ))
            );
          }

          posted = true;

          if (postsResults[i].status === 'pending') {
            const resolved = await this.resolvePending(
              postsList,
              post,
              postsResults[i]
            );
            if (!resolved) {
              return;
            }
            postsResults[i] = resolved;
          }

          await this._postService.updatePost(
            postsList[i].id,
            postsResults[i].postId,
            postsResults[i].releaseURL
          );
          updated = true;

          if (i === 0) {
            await this.inAppNotification(
              post.integration.organizationId,
              `Your post has been published on ${capitalize(
                post.integration.providerIdentifier
              )}`,
              `Your post has been published on ${capitalize(
                post.integration.providerIdentifier
              )} at ${postsResults[0].releaseURL}`,
              true
            );
          }
          break;
        } catch (err) {
          if (posted) {
            if (!updated) {
              await this.markUnconfirmed(postsList, post, err);
            }
            return;
          }

          const handle = await this.handlePublishError(err, post.integration);
          if (handle.type === 'retry') {
            continue;
          }
          await this._postService.changeState(
            postsList[0].id,
            'ERROR',
            err instanceof Error ? err.message : err,
            postsList
          );
          if (handle.type === 'bad-body') {
            await this.inAppNotification(
              post.organizationId,
              `Error posting${i === 0 ? ' ' : ' comments '}on ${
                post.integration?.providerIdentifier
              } for ${post?.integration?.name}`,
              `An error occurred while posting${i === 0 ? ' ' : ' comments '}on ${
                post.integration?.providerIdentifier
              }${handle.message ? `: ${handle.message}` : ``}`,
              true,
              'fail'
            );
          }
          return;
        }
      }

      if (postsResults.length === before) {
        await this.markUnconfirmed(
          postsList,
          post,
          'Could not publish after several attempts'
        );
        return;
      }
    }

    await this.sendWebhooks(
      postsResults[0].postId,
      post.organizationId,
      post.integration.id
    );
  }

  async markUnconfirmed(postsList: any[], post: any, err: any) {
    await this._postService.changeState(
      postsList[0].id,
      'ERROR',
      typeof err === 'string' ? err : err?.message || STALE_LOCK_MESSAGE,
      postsList
    );
    await this.inAppNotification(
      post.organizationId,
      `We couldn't confirm your post on ${capitalize(
        post.integration?.providerIdentifier
      )}`,
      `Your post was sent to ${capitalize(
        post.integration?.providerIdentifier
      )}, but we couldn't confirm it was published. Please check your ${
        post?.integration?.name
      } account before posting again to avoid duplicates.`,
      true,
      'fail'
    );
  }

  private async getPostsList(orgId: string, postId: string) {
    if (process.env.STRIPE_SECRET_KEY) {
      const subscription = await this._subscriptionService.getSubscription(
        orgId
      );
      if (!subscription) {
        return [];
      }
    }

    const getPosts = await this._postService.getPostsRecursively(
      postId,
      true,
      orgId
    );
    if (!getPosts || getPosts.length === 0 || getPosts[0].parentPostId) {
      return [];
    }

    return getPosts.map(slimPost);
  }

  private async handleDisconnect<T>(
    integration: Integration,
    func: () => Promise<T>
  ): Promise<T> {
    try {
      return await func();
    } catch (err) {
      if (err instanceof Disconnect) {
        try {
          await this._integrationService.disconnectChannel(
            integration.organizationId,
            integration,
            err.message
          );
        } catch (e) {
          /**empty**/
        }

        throw new BadBody(
          integration.providerIdentifier,
          JSON.stringify({}),
          Buffer.from('{}'),
          err.message
        );
      }

      throw err;
    }
  }

  private async postSocialPending(integration: Integration, posts: Post[]) {
    return this.handleDisconnect(integration, () =>
      this.postSocialBody(integration, posts, true)
    );
  }

  private async postComment(
    postId: string,
    lastPostId: string | undefined,
    integration: Integration,
    posts: Post[]
  ) {
    return this.handleDisconnect(integration, async () => {
      const getIntegration = this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );

      const newPosts = await this._postService.updateTags(
        integration.organizationId,
        posts
      );

      return getIntegration.comment(
        integration.internalId,
        postId,
        lastPostId,
        integration.token,
        await Promise.all(
          (newPosts || []).map(async (p) => ({
            id: p.id,
            message: stripHtmlValidation(
              getIntegration.editor,
              p.content,
              true,
              false,
              !/<\/?[a-z][\s\S]*>/i.test(p.content),
              getIntegration.mentionFormat
            ),
            settings: JSON.parse(p.settings || '{}'),
            media: await this._postService.updateMedia(
              p.id,
              JSON.parse(p.image || '[]'),
              getIntegration?.convertToJPEG || false
            ),
          }))
        ),
        integration
      );
    });
  }

  private async postSocialBody(
    integration: Integration,
    posts: Post[],
    allowPending: boolean
  ) {
    if (process.env.STRIPE_SECRET_KEY) {
      const subscription = await this._subscriptionService.getSubscription(
        integration.organizationId
      );

      if (!subscription) {
        throw new Error('No active subscription found for this organization.');
      }
    }

    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    const newPosts = await this._postService.updateTags(
      integration.organizationId,
      posts
    );

    const mappedPosts = await Promise.all(
      (newPosts || []).map(async (p) => ({
        id: p.id,
        message: stripHtmlValidation(
          getIntegration.editor,
          p.content,
          true,
          false,
          !/<\/?[a-z][\s\S]*>/i.test(p.content),
          getIntegration.mentionFormat,
          !!getIntegration.inlineImages?.(JSON.parse(p.settings || '{}'))
        ),
        settings: JSON.parse(p.settings || '{}'),
        media: await this._postService.updateMedia(
          p.id,
          JSON.parse(p.image || '[]'),
          getIntegration?.convertToJPEG || false
        ),
      }))
    );

    return allowPending && getIntegration.postPending
      ? await getIntegration.postPending(
          integration.internalId,
          integration.token,
          mappedPosts,
          integration
        )
      : await getIntegration.post(
          integration.internalId,
          integration.token,
          mappedPosts,
          integration
        );
  }

  private async resolvePending(
    postsList: any[],
    post: any,
    pending: PostResponse
  ): Promise<PostResponse | false> {
    let pendingData = pending.pendingData;
    let errorAttempts = 0;
    const getIntegration = this._integrationManager.getSocialIntegration(
      post.integration.providerIdentifier
    );

    for (let check = 0; check < PENDING_MAX_CHECKS; check++) {
      try {
        let result = await this.handleDisconnect(post.integration, () =>
          getIntegration.checkPostStatus(
            post.integration.token,
            pendingData,
            post.integration
          )
        );

        if (result.status !== 'completed') {
          pendingData = result.pendingData;
        }

        if (result.status === 'ready') {
          pendingData = result.pendingData;
          result = await this.handleDisconnect(post.integration, () =>
            getIntegration.finalizePost(
              post.integration.token,
              pendingData,
              post.integration
            )
          );
        }

        if (result.status === 'completed') {
          return {
            id: pending.id,
            postId: result.postId,
            releaseURL: result.releaseURL,
            status: 'success',
          };
        }

        pendingData = result.pendingData;
        errorAttempts = 0;
      } catch (err) {
        const handle = await this.handlePublishError(err, post.integration);
        if (handle.type === 'retry') {
          continue;
        }
        if (handle.type === 'stop') {
          await this.markUnconfirmed(postsList, post, err);
          return false;
        }
        if (handle.type === 'bad-body') {
          await this._postService.changeState(
            postsList[0].id,
            'ERROR',
            err instanceof Error ? err.message : err,
            postsList
          );
          await this.inAppNotification(
            post.organizationId,
            `Error posting on ${post.integration?.providerIdentifier} for ${post?.integration?.name}`,
            `An error occurred while posting on ${
              post.integration?.providerIdentifier
            }${handle.message ? `: ${handle.message}` : ``}`,
            true,
            'fail'
          );
          return false;
        }
        errorAttempts++;
        if (errorAttempts >= RETRY_ATTEMPTS) {
          break;
        }
      }

      await timer(20000);
    }

    await this.markUnconfirmed(postsList, post, STALE_LOCK_MESSAGE);
    return false;
  }

  private async handlePublishError(
    err: unknown,
    integration: Integration
  ): Promise<{ type: 'retry' | 'stop' | 'bad-body' | 'unknown'; message: string }> {
    const typed = err as { type?: string; message?: string };
    if (err instanceof RefreshToken || typed?.type === 'refresh_token') {
      try {
        const refresh = await this._refreshIntegrationService.refresh(
          integration,
          typed?.message || ''
        );
        if (!refresh || !refresh.accessToken) {
          return { type: 'stop', message: typed?.message || '' };
        }
        integration.token = refresh.accessToken;
        return { type: 'retry', message: typed?.message || '' };
      } catch (refreshErr) {
        return {
          type: 'stop',
          message:
            (refreshErr as Error)?.message || typed?.message || '',
        };
      }
    }

    if (err instanceof BadBody || typed?.type === 'bad_body') {
      return { type: 'bad-body', message: typed?.message || '' };
    }

    return { type: 'unknown', message: typed?.message || '' };
  }

  private async inAppNotification(
    orgId: string,
    subject: string,
    message: string,
    sendEmail = false,
    type: NotificationType = 'success'
  ) {
    await this._notificationService.inAppNotification(
      orgId,
      subject,
      message,
      sendEmail,
      false,
      type
    );
  }

  private async sendWebhooks(
    postId: string,
    orgId: string,
    integrationId: string
  ) {
    try {
      const webhooks = (await this._webhookService.getWebhooks(orgId)).filter(
        (f) => {
          return (
            f.integrations.length === 0 ||
            f.integrations.some((i) => i.integration.id === integrationId)
          );
        }
      );

      if (webhooks.length === 0) {
        return;
      }

      const post = await this._postService.getPostByForWebhookId(
        postId,
        integrationId
      );
      await Promise.all(
        webhooks.map(async (webhook) => {
          try {
            await fetch(webhook.url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(post),
              // @ts-ignore — undici option, not in lib.dom fetch types
              dispatcher: getSsrfSafeDispatcher(),
            });
          } catch (e) {
            /**empty**/
          }
        })
      );
    } catch (err) {
      /**empty**/
    }
  }
}
