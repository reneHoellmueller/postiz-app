export const DEFAULT_CATCHUP_HOURS = 6;
export const SKIP_WHILE_DOWN_MESSAGE =
  'Skipped: became due while the app was down';
export const STALE_LOCK_MESSAGE =
  'Could not confirm the post status after a previous publish attempt';

export type QueuedPostAction = 'wait' | 'publish' | 'skip';

export function catchupHoursFromEnv(
  value = process.env.SCHEDULER_CATCHUP_HOURS
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CATCHUP_HOURS;
  }
  return parsed;
}

export function classifyQueuedPost(
  publishDate: Date,
  now: Date,
  catchupHours = DEFAULT_CATCHUP_HOURS
): QueuedPostAction {
  const publishAt = new Date(publishDate).getTime();
  const nowAt = new Date(now).getTime();
  if (Number.isNaN(publishAt) || Number.isNaN(nowAt)) {
    return 'skip';
  }
  if (publishAt > nowAt) {
    return 'wait';
  }
  const ageMs = nowAt - publishAt;
  if (ageMs <= catchupHours * 60 * 60 * 1000) {
    return 'publish';
  }
  return 'skip';
}

export function canPrivateReplyToComment(
  createdAt: string | Date | undefined,
  now = new Date()
): boolean {
  if (!createdAt) {
    return true;
  }
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) {
    return true;
  }
  return now.getTime() - created <= 7 * 24 * 60 * 60 * 1000;
}

export function canReplyToConversation(
  lastInboundAt: string | Date | undefined,
  now = new Date()
): boolean {
  if (!lastInboundAt) {
    return false;
  }
  const created = new Date(lastInboundAt).getTime();
  if (Number.isNaN(created)) {
    return false;
  }
  return now.getTime() - created <= 24 * 60 * 60 * 1000;
}
