jest.mock('@gitroom/nestjs-libraries/database/prisma/posts/posts.service', () => ({
  PostsService: class PostsService {},
}));
jest.mock('@gitroom/nestjs-libraries/scheduler/publish.runner.service', () => ({
  PublishRunnerService: class PublishRunnerService {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({
    IntegrationService: class IntegrationService {},
  })
);

import { SchedulerService } from './scheduler.service';
import { SKIP_WHILE_DOWN_MESSAGE } from './scheduler.policy';

describe('SchedulerService', () => {
  const now = new Date('2026-10-09T18:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
    process.env.SCHEDULER_CATCHUP_HOURS = '6';
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.SCHEDULER_CATCHUP_HOURS;
  });

  function makeService() {
    const postsService = {
      findStalePublishLocks: jest.fn().mockResolvedValue([]),
      findDueQueuedPosts: jest.fn().mockResolvedValue([]),
      claimPostForPublish: jest.fn().mockResolvedValue({ count: 1 }),
      changeState: jest.fn().mockResolvedValue({}),
    };
    const publishRunner = {
      publishPost: jest.fn().mockResolvedValue(undefined),
    };
    const integrationService = {
      refreshTokens: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SchedulerService(
      postsService as any,
      publishRunner as any,
      integrationService as any
    );
    return { service, postsService, publishRunner };
  }

  it('publishes recently due posts and skips posts that aged out while down', async () => {
    const { service, postsService, publishRunner } = makeService();
    postsService.findDueQueuedPosts.mockResolvedValue([
      {
        id: 'old',
        organizationId: 'org',
        publishDate: new Date('2026-10-09T10:00:00.000Z'),
      },
      {
        id: 'recent',
        organizationId: 'org',
        publishDate: new Date('2026-10-09T16:00:00.000Z'),
      },
    ]);

    await service.tick();

    expect(publishRunner.publishPost).toHaveBeenCalledTimes(1);
    expect(publishRunner.publishPost).toHaveBeenCalledWith('org', 'recent');
    expect(postsService.changeState).toHaveBeenCalledWith(
      'old',
      'ERROR',
      SKIP_WHILE_DOWN_MESSAGE,
      [{ id: 'old', publishDate: new Date('2026-10-09T10:00:00.000Z') }]
    );
  });

  it('does not publish when another process already claimed the row', async () => {
    const { service, postsService, publishRunner } = makeService();
    postsService.findDueQueuedPosts.mockResolvedValue([
      {
        id: 'recent',
        organizationId: 'org',
        publishDate: new Date('2026-10-09T17:00:00.000Z'),
      },
    ]);
    postsService.claimPostForPublish.mockResolvedValue({ count: 0 });

    await service.tick();

    expect(publishRunner.publishPost).not.toHaveBeenCalled();
    expect(postsService.changeState).not.toHaveBeenCalled();
  });
});
