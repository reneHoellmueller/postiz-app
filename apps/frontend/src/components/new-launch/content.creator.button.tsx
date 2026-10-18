'use client';

import { FC, useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';

export const ContentCreatorButton: FC<{
  editor: any;
  currentValue: string;
  maxLength?: number;
}> = ({ editor, currentValue, maxLength }) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const [loading, setLoading] = useState(false);
  const label = t('text_from_content_creator', 'Text vom Content Creator');

  const generate = useCallback(async () => {
    if (loading) {
      return;
    }

    const brief = stripHtmlValidation('normal', currentValue || '', true).trim();
    if (!brief) {
      toaster.show(
        t(
          'content_creator_needs_brief',
          'Bitte zuerst eine Idee oder ein Briefing in den Editor schreiben.'
        ),
        'warning'
      );
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/content-creator/generate', {
        method: 'POST',
        body: JSON.stringify({
          type: 'post',
          brief,
          ...(maxLength ? { maxLength } : {}),
        }),
      });

      if (!response.ok) {
        let message = t(
          'content_creator_failed',
          'Text konnte nicht erzeugt werden.'
        );
        try {
          const body = await response.json();
          if (body?.msg) {
            message = body.msg;
          }
        } catch {
          // Keep the generic message when the error body is not JSON.
        }
        toaster.show(message, 'warning');
        return;
      }

      const result = await response.json();
      const caption = [result.text, ...(result.hashtags || [])]
        .filter(Boolean)
        .join('\n\n');
      editor?.commands?.setContent(plainTextToHtml(caption));
      editor?.commands?.focus('end');
      toaster.show(
        t('content_creator_ready', 'Text vom Content Creator eingefügt.')
      );
    } catch {
      toaster.show(
        t(
          'content_creator_failed',
          'Text konnte nicht erzeugt werden.'
        ),
        'warning'
      );
    } finally {
      setLoading(false);
    }
  }, [currentValue, editor, fetch, loading, maxLength, t, toaster]);

  return (
    <div
      data-tooltip-id="tooltip"
      data-tooltip-content={label}
      onClick={generate}
      className="select-none cursor-pointer rounded-[6px] mobile:rounded-[8px] h-[30px] mobile:h-[40px] px-[8px] bg-ai text-white text-[11px] font-[600] flex justify-center items-center whitespace-nowrap"
    >
      {loading ? t('content_creator_loading', '…') : label}
    </div>
  );
};

function plainTextToHtml(text: string) {
  return text
    .split(/\n/)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
