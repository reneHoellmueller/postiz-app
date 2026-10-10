import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { ReplyTemplateDto } from '@gitroom/nestjs-libraries/dtos/inbox/inbox.dto';

@Injectable()
export class InboxRepository {
  constructor(private _templates: PrismaRepository<'replyTemplate'>) {}

  listTemplates(orgId: string) {
    return this._templates.model.replyTemplate.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: {
        id: true,
        name: true,
        body: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  getTemplate(orgId: string, id: string) {
    return this._templates.model.replyTemplate.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      select: {
        id: true,
        name: true,
        body: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  createTemplate(orgId: string, body: ReplyTemplateDto) {
    return this._templates.model.replyTemplate.create({
      data: {
        organizationId: orgId,
        name: body.name,
        body: body.body,
      },
      select: {
        id: true,
        name: true,
        body: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  updateTemplate(id: string, body: ReplyTemplateDto) {
    return this._templates.model.replyTemplate.update({
      where: { id },
      data: {
        name: body.name,
        body: body.body,
      },
      select: {
        id: true,
        name: true,
        body: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  deleteTemplate(id: string) {
    return this._templates.model.replyTemplate.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true },
    });
  }
}
