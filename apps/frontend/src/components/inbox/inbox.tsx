'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import {
  useInboxComments,
  useInboxConversations,
  useInboxMessages,
  useInboxTemplates,
} from '@gitroom/frontend/components/inbox/use.inbox';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import clsx from 'clsx';

const INBOX_PROVIDERS = ['instagram', 'instagram-standalone', 'facebook'];

export const Inbox: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data: integrations } = useIntegrationList();
  const inboxIntegrations = useMemo(
    () =>
      (integrations || []).filter((item: any) =>
        INBOX_PROVIDERS.includes(item.identifier)
      ),
    [integrations]
  );
  const [integrationId, setIntegrationId] = useState<string>('');
  const [tab, setTab] = useState<'comments' | 'messages' | 'templates'>(
    'comments'
  );
  const selectedId = integrationId || inboxIntegrations[0]?.id;
  const selected = inboxIntegrations.find((item: any) => item.id === selectedId);

  return (
    <div className="flex flex-col gap-[16px]">
      <div>
        <h3 className="text-[20px]">{t('inbox', 'Inbox')}</h3>
        <div className="text-[14px] opacity-70 mt-[4px]">
          {t(
            'inbox_help',
            'Read comments and DMs on Instagram and Facebook Page. Replies follow Meta rules: no cold first messages, one private reply per comment within 7 days, DMs only inside the 24-hour window. Reconnect the channel once so the new scopes are granted.'
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-[8px]">
        {inboxIntegrations.map((item: any) => (
          <Button
            key={item.id}
            innerClassName={clsx(
              selectedId !== item.id && 'bg-[rgb(var(--new-textColor)/0.08)]'
            )}
            onClick={() => setIntegrationId(item.id)}
          >
            {item.name}
          </Button>
        ))}
      </div>
      {!inboxIntegrations.length && (
        <div className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[24px]">
          {t(
            'inbox_no_channels',
            'Connect Instagram or a Facebook Page, then reconnect after adding comment and messaging permissions.'
          )}
        </div>
      )}
      {!!selected && (
        <>
          <div className="flex gap-[8px]">
            {(['comments', 'messages', 'templates'] as const).map((item) => (
              <Button
                key={item}
                onClick={() => setTab(item)}
                innerClassName={clsx(tab !== item && 'opacity-60')}
              >
                {t(item, item)}
              </Button>
            ))}
          </div>
          {tab === 'comments' && (
            <CommentsPane integrationId={selected.id} />
          )}
          {tab === 'messages' && (
            <MessagesPane integrationId={selected.id} />
          )}
          {tab === 'templates' && <TemplatesPane />}
        </>
      )}
    </div>
  );
};

const CommentsPane: FC<{ integrationId: string }> = ({ integrationId }) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, mutate, error, isLoading } = useInboxComments(integrationId);
  const { data: templates, mutate: mutateTemplates } = useInboxTemplates();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const send = useCallback(
    async (commentId: string, path: 'reply' | 'private-reply') => {
      const message = drafts[commentId]?.trim();
      if (!message) {
        return;
      }
      const response = await fetch(
        `/inbox/comments/${commentId}/${path}?integrationId=${integrationId}`,
        {
          method: 'POST',
          body: JSON.stringify({ message }),
        }
      );
      if (!response.ok) {
        toaster.show(t('inbox_send_failed', 'Could not send the reply'), 'warning');
        return;
      }
      toaster.show(t('inbox_sent', 'Reply sent'), 'success');
      setDrafts((current) => ({ ...current, [commentId]: '' }));
      mutate();
    },
    [drafts, fetch, integrationId, mutate, t, toaster]
  );

  const sendTemplate = useCallback(
    async (commentId: string, templateId: string, target: 'comment' | 'private-reply') => {
      const response = await fetch(`/inbox/templates/${templateId}/send`, {
        method: 'POST',
        body: JSON.stringify({
          target,
          integrationId,
          commentId,
        }),
      });
      if (!response.ok) {
        toaster.show(t('inbox_send_failed', 'Could not send the reply'), 'warning');
        return;
      }
      toaster.show(t('inbox_sent', 'Reply sent'), 'success');
      mutate();
    },
    [fetch, integrationId, mutate, t, toaster]
  );

  if (isLoading) {
    return <div>{t('loading', 'Loading...')}</div>;
  }
  if (error) {
    return (
      <div className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[24px]">
        {t(
          'inbox_comments_error',
          'Could not load comments. Reconnect the channel if you have not granted comment permissions yet.'
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[12px]">
      {!(data || []).length && (
        <div className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[24px]">
          {t('inbox_no_comments', 'No comments yet.')}
        </div>
      )}
      {(data || []).map((comment: any) => (
        <div
          key={comment.id}
          className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[16px] flex flex-col gap-[8px]"
        >
          <div className="text-[13px] opacity-70">
            {comment.fromName || t('unknown', 'Unknown')} · {comment.createdAt}
            {comment.mediaPermalink ? (
              <>
                {' '}
                ·{' '}
                <a href={comment.mediaPermalink} target="_blank" rel="noreferrer">
                  {t('post', 'Post')}
                </a>
              </>
            ) : null}
          </div>
          <div>{comment.text}</div>
          <textarea
            className="bg-newBgColor outline-none border border-newBorder rounded-[6px] p-[8px] min-h-[72px] text-newTextColor"
            value={drafts[comment.id] || ''}
            onChange={(event) =>
              setDrafts((current) => ({
                ...current,
                [comment.id]: event.target.value,
              }))
            }
            placeholder={t('write_a_reply', 'Write a reply')}
          />
          <div className="flex flex-wrap gap-[8px]">
            <Button onClick={() => send(comment.id, 'reply')}>
              {t('reply', 'Reply')}
            </Button>
            {comment.canPrivateReply && (
              <Button onClick={() => send(comment.id, 'private-reply')}>
                {t('private_reply', 'Private reply (DM)')}
              </Button>
            )}
            {(templates || []).map((template: any) => (
              <Button
                key={template.id}
                onClick={() =>
                  sendTemplate(comment.id, template.id, 'private-reply')
                }
              >
                {template.name}
              </Button>
            ))}
          </div>
        </div>
      ))}
      <Button
        onClick={() => {
          mutate();
          mutateTemplates();
        }}
      >
        {t('refresh', 'Refresh')}
      </Button>
    </div>
  );
};

const MessagesPane: FC<{ integrationId: string }> = ({ integrationId }) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, error, isLoading, mutate } = useInboxConversations(integrationId);
  const [conversation, setConversation] = useState<any>();
  const { data: messages, mutate: mutateMessages } = useInboxMessages(
    integrationId,
    conversation?.id
  );
  const [draft, setDraft] = useState('');

  const send = useCallback(async () => {
    if (!conversation?.participantId || !draft.trim()) {
      return;
    }
    const response = await fetch(
      `/inbox/conversations/${conversation.id}/messages?integrationId=${integrationId}`,
      {
        method: 'POST',
        body: JSON.stringify({
          message: draft,
          recipientId: conversation.participantId,
        }),
      }
    );
    if (!response.ok) {
      toaster.show(
        t(
          'inbox_dm_failed',
          'Could not send the DM. Meta only allows replies inside the 24-hour window.'
        ),
        'warning'
      );
      return;
    }
    setDraft('');
    toaster.show(t('inbox_sent', 'Reply sent'), 'success');
    mutateMessages();
  }, [conversation, draft, fetch, integrationId, mutateMessages, t, toaster]);

  if (isLoading) {
    return <div>{t('loading', 'Loading...')}</div>;
  }
  if (error) {
    return (
      <div className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[24px]">
        {t(
          'inbox_dm_error',
          'Could not load conversations. In Instagram, enable Settings → Messages → Allow access to messages, then reconnect the channel.'
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
      <div className="flex flex-col gap-[8px]">
        {!(data || []).length && (
          <div className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[24px]">
            {t('inbox_no_conversations', 'No conversations yet.')}
          </div>
        )}
        {(data || []).map((item: any) => (
          <button
            key={item.id}
            className={clsx(
              'text-left bg-newBgColorInner border border-newBorder rounded-[8px] p-[12px]',
              conversation?.id === item.id && 'border-white'
            )}
            onClick={() => setConversation(item)}
          >
            <div className="font-medium">
              {item.participantName || item.participantId || item.id}
            </div>
            <div className="text-[13px] opacity-70">{item.snippet}</div>
          </button>
        ))}
        <Button onClick={() => mutate()}>{t('refresh', 'Refresh')}</Button>
      </div>
      <div className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[16px] flex flex-col gap-[8px] min-h-[320px]">
        {(messages || []).map((item: any) => (
          <div
            key={item.id}
            className={clsx(
              'rounded-[6px] p-[8px]',
              item.outgoing ? 'bg-[rgb(var(--new-textColor)/0.08)] ml-[24px]' : 'mr-[24px]'
            )}
          >
            <div className="text-[12px] opacity-70">
              {item.fromName} · {item.createdAt}
            </div>
            <div>{item.text}</div>
          </div>
        ))}
        {conversation && (
          <>
            <textarea
              className="bg-newBgColor outline-none border border-newBorder rounded-[6px] p-[8px] min-h-[72px] text-newTextColor"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t('write_a_reply', 'Write a reply')}
            />
            <Button onClick={send}>{t('send', 'Send')}</Button>
          </>
        )}
      </div>
    </div>
  );
};

const TemplatesPane: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, mutate } = useInboxTemplates();
  const [name, setName] = useState('Demo-Account');
  const [body, setBody] = useState('');

  const save = useCallback(async () => {
    if (!name.trim() || !body.trim()) {
      return;
    }
    await fetch('/inbox/templates', {
      method: 'POST',
      body: JSON.stringify({ name, body }),
    });
    setBody('');
    toaster.show(t('template_saved', 'Template saved'), 'success');
    mutate();
  }, [body, fetch, mutate, name, t, toaster]);

  const remove = useCallback(
    async (id: string) => {
      await fetch(`/inbox/templates/${id}`, { method: 'DELETE' });
      mutate();
    },
    [fetch, mutate]
  );

  return (
    <div className="flex flex-col gap-[12px]">
      {(data || []).map((template: any) => (
        <div
          key={template.id}
          className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[16px] flex justify-between gap-[12px]"
        >
          <div>
            <div className="font-medium">{template.name}</div>
            <div className="text-[14px] opacity-80 whitespace-pre-wrap">
              {template.body}
            </div>
          </div>
          <Button onClick={() => remove(template.id)}>
            {t('delete', 'Delete')}
          </Button>
        </div>
      ))}
      <div className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[16px] flex flex-col gap-[8px]">
        <input
          className="bg-newBgColor outline-none border border-newBorder rounded-[6px] p-[8px] text-newTextColor"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('template_name', 'Template name')}
        />
        <textarea
          className="bg-newBgColor outline-none border border-newBorder rounded-[6px] p-[8px] min-h-[96px] text-newTextColor"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={t(
            'template_body',
            'e.g. Here is the demo account link: …'
          )}
        />
        <Button onClick={save}>{t('save_template', 'Save template')}</Button>
      </div>
    </div>
  );
};
