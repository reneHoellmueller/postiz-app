import {
  canPrivateReplyToComment,
  canReplyToConversation,
  catchupHoursFromEnv,
  classifyQueuedPost,
  DEFAULT_CATCHUP_HOURS,
} from './scheduler.policy';

describe('classifyQueuedPost', () => {
  const now = new Date('2026-10-09T18:00:00.000Z');

  it('waits for posts that are still in the future', () => {
    expect(
      classifyQueuedPost(new Date('2026-10-09T18:30:00.000Z'), now, 6)
    ).toBe('wait');
  });

  it('publishes posts that became due within the catch-up window', () => {
    expect(
      classifyQueuedPost(new Date('2026-10-09T14:00:00.000Z'), now, 6)
    ).toBe('publish');
    expect(
      classifyQueuedPost(new Date('2026-10-09T17:59:00.000Z'), now, 6)
    ).toBe('publish');
  });

  it('skips posts that became due too long ago', () => {
    expect(
      classifyQueuedPost(new Date('2026-10-09T10:00:00.000Z'), now, 6)
    ).toBe('skip');
    expect(
      classifyQueuedPost(new Date('2026-10-01T18:00:00.000Z'), now, 6)
    ).toBe('skip');
  });

  it('treats a due-now post as publishable', () => {
    expect(classifyQueuedPost(now, now, 6)).toBe('publish');
  });
});

describe('catchupHoursFromEnv', () => {
  it('falls back to the default for empty or invalid values', () => {
    expect(catchupHoursFromEnv(undefined)).toBe(DEFAULT_CATCHUP_HOURS);
    expect(catchupHoursFromEnv('')).toBe(DEFAULT_CATCHUP_HOURS);
    expect(catchupHoursFromEnv('nope')).toBe(DEFAULT_CATCHUP_HOURS);
    expect(catchupHoursFromEnv('0')).toBe(DEFAULT_CATCHUP_HOURS);
  });

  it('parses a positive number', () => {
    expect(catchupHoursFromEnv('2')).toBe(2);
  });
});

describe('Meta windows', () => {
  const now = new Date('2026-10-09T18:00:00.000Z');

  it('allows a private reply within 7 days of the comment', () => {
    expect(
      canPrivateReplyToComment(new Date('2026-10-03T18:00:00.000Z'), now)
    ).toBe(true);
    expect(
      canPrivateReplyToComment(new Date('2026-10-02T17:59:00.000Z'), now)
    ).toBe(false);
  });

  it('allows a conversation reply within 24 hours of the last inbound message', () => {
    expect(
      canReplyToConversation(new Date('2026-10-09T10:00:00.000Z'), now)
    ).toBe(true);
    expect(
      canReplyToConversation(new Date('2026-10-08T17:59:00.000Z'), now)
    ).toBe(false);
    expect(canReplyToConversation(undefined, now)).toBe(false);
  });
});
