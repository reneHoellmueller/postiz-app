import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { PublishRunnerService } from '@gitroom/nestjs-libraries/scheduler/publish.runner.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import {
  catchupHoursFromEnv,
  classifyQueuedPost,
  SKIP_WHILE_DOWN_MESSAGE,
  STALE_LOCK_MESSAGE,
} from '@gitroom/nestjs-libraries/scheduler/scheduler.policy';
import dayjs from 'dayjs';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);
  private ticking = false;
  private refreshing = false;

  constructor(
    private _postsService: PostsService,
    private _publishRunner: PublishRunnerService,
    private _integrationService: IntegrationService
  ) {}

  async onModuleInit() {
    // Do not await: a pending Instagram/Facebook publish can take minutes and
    // would otherwise delay Nest listening for HTTP.
    void this.tick();
  }

  @Interval(10000)
  async onInterval() {
    await this.tick();
  }

  @Interval(60 * 60 * 1000)
  async onRefreshInterval() {
    await this.refreshDueTokens();
  }

  async tick() {
    if (this.ticking) {
      return;
    }
    this.ticking = true;
    try {
      await this.failStaleLocks();
      await this.processDuePosts();
    } catch (err) {
      this.logger.error(err);
    } finally {
      this.ticking = false;
    }
  }

  private async failStaleLocks() {
    const staleBefore = dayjs().subtract(40, 'minute').toDate();
    const stale = await this._postsService.findStalePublishLocks(staleBefore);
    for (const post of stale) {
      await this._postsService.changeState(
        post.id,
        'ERROR',
        STALE_LOCK_MESSAGE,
        [{ id: post.id }]
      );
    }
  }

  private async processDuePosts() {
    const catchupHours = catchupHoursFromEnv();
    const now = new Date();
    const due = await this._postsService.findDueQueuedPosts();

    for (const post of due) {
      const action = classifyQueuedPost(post.publishDate, now, catchupHours);
      if (action === 'wait') {
        continue;
      }

      const claimed = await this._postsService.claimPostForPublish(post.id);
      if (!claimed.count) {
        continue;
      }

      if (action === 'skip') {
        await this._postsService.changeState(
          post.id,
          'ERROR',
          SKIP_WHILE_DOWN_MESSAGE,
          [{ id: post.id, publishDate: post.publishDate }]
        );
        continue;
      }

      try {
        await this._publishRunner.publishPost(post.organizationId, post.id);
      } catch (err) {
        this.logger.error(
          `Publish failed for post ${post.id}`,
          err instanceof Error ? err.stack : err
        );
        try {
          await this._postsService.changeState(
            post.id,
            'ERROR',
            err instanceof Error ? err.message : 'Publish failed',
            [{ id: post.id }]
          );
        } catch (e) {
          /**empty**/
        }
      }
    }
  }

  private async refreshDueTokens() {
    if (this.refreshing) {
      return;
    }
    this.refreshing = true;
    try {
      await this._integrationService.refreshTokens();
    } catch (err) {
      this.logger.error(err);
    } finally {
      this.refreshing = false;
    }
  }
}
