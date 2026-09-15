import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateDocumentDto, UpdateDocumentDto } from './dto/create-document.dto';
import { QueryDocumentDto } from './dto/query-document.dto';

export const TOP_LEVEL_ADMINS: Role[] = [Role.SUPER_ADMIN, Role.STATE_ADMIN, Role.SENATORIAL_ADMIN];
export const CAN_MANAGE_DOCUMENTS: Role[] = [...TOP_LEVEL_ADMINS, Role.LGA_ADMIN, Role.WARD_ADMIN];

export const DOCUMENT_STORAGE_DIR = path.join(process.cwd(), 'document-storage');

const DOCUMENT_SELECT = {
  id: true,
  title: true,
  description: true,
  category: true,
  fileName: true,
  mimeType: true,
  fileSize: true,
  restrictedToAdmins: true,
  createdAt: true,
  updatedAt: true,
  uploadedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.DocumentSelect;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateDocumentDto, file: Express.Multer.File, actor: AuthenticatedUser) {
    if (!file) throw new BadRequestException('No file was uploaded.');

    const document = await this.prisma.document.create({
      data: {
        title: dto.title,
        description: dto.description,
        category: dto.category,
        fileName: file.originalname,
        storedFileName: file.filename,
        mimeType: file.mimetype,
        fileSize: file.size,
        restrictedToAdmins: dto.restrictedToAdmins === 'true',
        uploadedById: actor.id,
      },
      select: DOCUMENT_SELECT,
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.DOCUMENT_UPLOADED,
      entityType: 'Document',
      entityId: document.id,
      metadata: { title: document.title, category: document.category },
    });

    return document;
  }

  async findAll(query: QueryDocumentDto, actor: AuthenticatedUser) {
    const page = Math.max(parseInt(query.page ?? '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(query.pageSize ?? '25', 10) || 25, 1), 100);

    const where: Prisma.DocumentWhereInput = {
      deletedAt: null,
      ...(TOP_LEVEL_ADMINS.includes(actor.role) ? {} : { restrictedToAdmins: false }),
      ...(query.category ? { category: query.category } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        select: DOCUMENT_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.document.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /**
   * Fetches a document, enforcing visibility. A restricted document that an
   * unauthorized user can't see is reported as "not found" rather than
   * "forbidden" — a 403 would confirm the document exists.
   */
  private async findVisible(id: string, actor: AuthenticatedUser) {
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null },
      select: { ...DOCUMENT_SELECT, storedFileName: true, uploadedById: true },
    });
    if (!document) throw new NotFoundException('Document not found.');
    if (document.restrictedToAdmins && !TOP_LEVEL_ADMINS.includes(actor.role)) {
      throw new NotFoundException('Document not found.');
    }
    return document;
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const document = await this.findVisible(id, actor);
    return { ...document, storedFileName: undefined };
  }

  async getFileForDownload(id: string, actor: AuthenticatedUser) {
    const document = await this.findVisible(id, actor);

    if (document.restrictedToAdmins) {
      await this.auditService.record({
        actorId: actor.id,
        action: AuditAction.RESTRICTED_DOCUMENT_DOWNLOADED,
        entityType: 'Document',
        entityId: document.id,
      });
    }

    return {
      filePath: path.join(DOCUMENT_STORAGE_DIR, document.storedFileName),
      fileName: document.fileName,
      mimeType: document.mimeType,
    };
  }

  async update(id: string, dto: UpdateDocumentDto, actor: AuthenticatedUser) {
    const document = await this.findVisible(id, actor);
    this.assertCanManage(actor, document.uploadedById);

    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        category: dto.category,
        restrictedToAdmins: dto.restrictedToAdmins,
      },
      select: DOCUMENT_SELECT,
    });

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.DOCUMENT_UPDATED,
      entityType: 'Document',
      entityId: id,
    });

    return updated;
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const document = await this.findVisible(id, actor);
    this.assertCanManage(actor, document.uploadedById);

    await this.prisma.document.update({ where: { id }, data: { deletedAt: new Date() } });

    try {
      await fs.unlink(path.join(DOCUMENT_STORAGE_DIR, document.storedFileName));
    } catch {
      // File already missing on disk — the DB soft-delete is the source of truth either way.
    }

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.DOCUMENT_DELETED,
      entityType: 'Document',
      entityId: id,
      metadata: { title: document.title },
    });
  }

  private assertCanManage(actor: AuthenticatedUser, uploadedById: string) {
    if (CAN_MANAGE_DOCUMENTS.includes(actor.role) || actor.id === uploadedById) return;
    throw new ForbiddenException('You do not have permission to manage this document.');
  }
}
