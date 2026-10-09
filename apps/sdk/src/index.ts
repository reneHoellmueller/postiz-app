import { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';
import { GetPostsDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.dto';
import fetch, { FormData } from 'node-fetch';

function toQueryString(obj: Record<string, any>): string {
  const params = new URLSearchParams();
  Object.entries(obj).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  });
  return params.toString();
}

export default class Postiz {
  constructor(
    private _apiKey: string,
    private _path = 'https://api.postiz.com'
  ) {}

  async post(posts: CreatePostDto) {
    return (
      await fetch(`${this._path}/public/v1/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this._apiKey,
        },
        body: JSON.stringify(posts),
      })
    ).json();
  }

  async postList(filters: GetPostsDto) {
    return (
      await fetch(`${this._path}/public/v1/posts?${toQueryString(filters)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this._apiKey,
        },
      })
    ).json();
  }

  async upload(file: Buffer, extension: string) {
    const formData = new FormData();
    const type =
      extension === 'png'
        ? 'image/png'
        : extension === 'jpg'
        ? 'image/jpeg'
        : extension === 'gif'
        ? 'image/gif'
        : extension === 'jpeg'
        ? 'image/jpeg'
        : 'image/jpeg';

    const blob = new Blob([file], { type });
    formData.append('file', blob, extension);

    return (
      await fetch(`${this._path}/public/v1/upload`, {
        method: 'POST',
        // @ts-ignore
        body: formData,
        headers: {
          Authorization: this._apiKey,
        },
      })
    ).json();
  }

  async integrations() {
    return (
      await fetch(`${this._path}/public/v1/integrations`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this._apiKey,
        },
      })
    ).json();
  }

  deletePost(id: string) {
    return fetch(`${this._path}/public/v1/posts/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this._apiKey,
      },
    });
  }

  private inboxHeaders() {
    return {
      'Content-Type': 'application/json',
      Authorization: this._apiKey,
    };
  }

  inboxComments(integrationId: string, since?: string) {
    return fetch(
      `${this._path}/public/v1/inbox/comments?${toQueryString({
        integrationId,
        since,
      })}`,
      { headers: this.inboxHeaders() }
    ).then((res) => res.json());
  }

  inboxReplyComment(
    integrationId: string,
    commentId: string,
    body: { message?: string; templateId?: string }
  ) {
    return fetch(
      `${this._path}/public/v1/inbox/comments/${commentId}/reply?${toQueryString(
        { integrationId }
      )}`,
      {
        method: 'POST',
        headers: this.inboxHeaders(),
        body: JSON.stringify(body),
      }
    ).then((res) => res.json());
  }

  inboxPrivateReply(
    integrationId: string,
    commentId: string,
    body: { message?: string; templateId?: string }
  ) {
    return fetch(
      `${this._path}/public/v1/inbox/comments/${commentId}/private-reply?${toQueryString(
        { integrationId }
      )}`,
      {
        method: 'POST',
        headers: this.inboxHeaders(),
        body: JSON.stringify(body),
      }
    ).then((res) => res.json());
  }

  inboxConversations(integrationId: string) {
    return fetch(
      `${this._path}/public/v1/inbox/conversations?${toQueryString({
        integrationId,
      })}`,
      { headers: this.inboxHeaders() }
    ).then((res) => res.json());
  }

  inboxMessages(integrationId: string, conversationId: string) {
    return fetch(
      `${this._path}/public/v1/inbox/conversations/${conversationId}/messages?${toQueryString(
        { integrationId }
      )}`,
      { headers: this.inboxHeaders() }
    ).then((res) => res.json());
  }

  inboxSendMessage(
    integrationId: string,
    conversationId: string,
    body: { recipientId: string; message?: string; templateId?: string }
  ) {
    return fetch(
      `${this._path}/public/v1/inbox/conversations/${conversationId}/messages?${toQueryString(
        { integrationId }
      )}`,
      {
        method: 'POST',
        headers: this.inboxHeaders(),
        body: JSON.stringify(body),
      }
    ).then((res) => res.json());
  }

  inboxTemplates() {
    return fetch(`${this._path}/public/v1/inbox/templates`, {
      headers: this.inboxHeaders(),
    }).then((res) => res.json());
  }

  inboxCreateTemplate(body: { name: string; body: string }) {
    return fetch(`${this._path}/public/v1/inbox/templates`, {
      method: 'POST',
      headers: this.inboxHeaders(),
      body: JSON.stringify(body),
    }).then((res) => res.json());
  }
}
