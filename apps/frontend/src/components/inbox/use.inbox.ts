import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCallback } from 'react';
import useSWR from 'swr';

export const useInboxComments = (integrationId?: string) => {
  const fetch = useFetch();
  const load = useCallback(async (path: string) => {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error('inbox request failed');
    }
    return response.json();
  }, [fetch]);

  return useSWR(
    integrationId ? `/inbox/comments?integrationId=${integrationId}` : null,
    load,
    {
      revalidateOnFocus: false,
      refreshInterval: 30000,
    }
  );
};

export const useInboxConversations = (integrationId?: string) => {
  const fetch = useFetch();
  const load = useCallback(async (path: string) => {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error('inbox request failed');
    }
    return response.json();
  }, [fetch]);

  return useSWR(
    integrationId
      ? `/inbox/conversations?integrationId=${integrationId}`
      : null,
    load,
    {
      revalidateOnFocus: false,
      refreshInterval: 30000,
    }
  );
};

export const useInboxMessages = (
  integrationId?: string,
  conversationId?: string
) => {
  const fetch = useFetch();
  const load = useCallback(async (path: string) => {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error('inbox request failed');
    }
    return response.json();
  }, [fetch]);

  return useSWR(
    integrationId && conversationId
      ? `/inbox/conversations/${conversationId}/messages?integrationId=${integrationId}`
      : null,
    load,
    {
      revalidateOnFocus: false,
    }
  );
};

export const useInboxTemplates = () => {
  const fetch = useFetch();
  const load = useCallback(async (path: string) => {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error('inbox request failed');
    }
    return response.json();
  }, [fetch]);

  return useSWR('/inbox/templates', load, {
    revalidateOnFocus: false,
  });
};
