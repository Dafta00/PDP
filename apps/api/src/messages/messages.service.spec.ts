import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { MessagesService } from './messages.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';

function makeUser(overrides: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 'actor-1',
    email: 'actor@example.com',
    role: Role.WARD_ADMIN,
    senatorialDistrictId: null,
    lgaId: null,
    wardId: null,
    pollingUnitId: null,
    ...overrides,
  };
}

function makeService(messages: any[] = [], users: any[] = []) {
  const prisma: any = {
    user: {
      findUnique: jest.fn(async ({ where }: any) => users.find((u) => u.id === where.id) ?? null),
      findMany: jest.fn(async ({ where }: any) =>
        users.filter((u) => u.id !== where.id.not && u.status === 'ACTIVE'),
      ),
    },
    message: {
      findUnique: jest.fn(async ({ where }: any) => messages.find((m) => m.id === where.id) ?? null),
      findMany: jest.fn(async ({ where }: any) =>
        messages.filter((m) =>
          where.recipientId ? m.recipientId === where.recipientId : m.senderId === where.senderId,
        ),
      ),
      count: jest.fn(async () => messages.length),
      create: jest.fn(async ({ data }: any) => {
        const created = { id: 'msg-new', createdAt: new Date(), readAt: null, ...data };
        messages.push(created);
        return created;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const msg = messages.find((m) => m.id === where.id);
        Object.assign(msg, data);
        return msg;
      }),
    },
    messageAttachment: {
      findFirst: jest.fn(async ({ where }: any) =>
        messages.find((m) => m.id === where.messageId)?.attachments?.find((a: any) => a.id === where.id) ?? null,
      ),
    },
  };
  const auditService = { record: jest.fn() };
  const orgScope = { canCommunicateWith: jest.fn().mockResolvedValue(true) };
  const service = new MessagesService(prisma, auditService as any, orgScope as any);
  return { service, prisma, auditService, orgScope };
}

const RECIPIENT = {
  id: 'user-2',
  role: Role.LGA_ADMIN,
  senatorialDistrictId: null,
  lgaId: 'lga-1',
  wardId: null,
  pollingUnitId: null,
  status: 'ACTIVE',
};

describe('MessagesService', () => {
  describe('create — authorization', () => {
    it('sends a message when canCommunicateWith authorizes it', async () => {
      const { service, prisma, auditService } = makeService([], [RECIPIENT]);
      const actor = makeUser({ id: 'user-1', role: Role.WARD_ADMIN, wardId: 'ward-1' });

      const message = await service.create(
        { recipientId: 'user-2', subject: 'Hello', body: 'Test message' } as any,
        [],
        actor,
      );

      expect(message.senderId ?? prisma.message.create.mock.calls[0][0].data.senderId).toBe('user-1');
      expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'MESSAGE_SENT' }));
    });

    it('refuses to send when canCommunicateWith denies it, and audits the denial', async () => {
      const { service, orgScope, auditService, prisma } = makeService([], [RECIPIENT]);
      orgScope.canCommunicateWith.mockResolvedValue(false);
      const actor = makeUser({ id: 'user-1', role: Role.WARD_ADMIN, wardId: 'ward-99' });

      await expect(
        service.create({ recipientId: 'user-2', subject: 'Hi', body: 'Test' } as any, [], actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.message.create).not.toHaveBeenCalled();
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'MESSAGE_AUTHORIZATION_DENIED' }),
      );
    });

    it('rejects sending a message to oneself', async () => {
      const { service } = makeService([], [RECIPIENT]);
      const actor = makeUser({ id: 'user-1', role: Role.WARD_ADMIN, wardId: 'ward-1' });
      await expect(
        service.create({ recipientId: 'user-1', subject: 'Hi', body: 'Test' } as any, [], actor),
      ).rejects.toThrow();
    });

    it('rejects an unknown recipient id (cannot be used to enumerate users)', async () => {
      const { service } = makeService([], [RECIPIENT]);
      const actor = makeUser({ id: 'user-1', role: Role.WARD_ADMIN, wardId: 'ward-1' });
      await expect(
        service.create({ recipientId: 'ghost', subject: 'Hi', body: 'Test' } as any, [], actor),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findOne — IDOR/BOLA protection', () => {
    it('lets the recipient read the message and marks it read', async () => {
      const messages = [
        { id: 'm1', senderId: 'user-1', recipientId: 'user-2', subject: 'S', body: 'B', readAt: null },
      ];
      const { service, auditService } = makeService(messages, [RECIPIENT]);
      const actor = makeUser({ id: 'user-2', role: Role.LGA_ADMIN, lgaId: 'lga-1' });

      const result = await service.findOne('m1', actor);

      expect(result.readAt).not.toBeNull();
      expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'MESSAGE_READ' }));
    });

    it('lets the sender read their own sent message without marking it read', async () => {
      const messages = [
        { id: 'm1', senderId: 'user-1', recipientId: 'user-2', subject: 'S', body: 'B', readAt: null },
      ];
      const { service, auditService } = makeService(messages, [RECIPIENT]);
      const actor = makeUser({ id: 'user-1', role: Role.WARD_ADMIN, wardId: 'ward-1' });

      const result = await service.findOne('m1', actor);

      expect(result.readAt).toBeNull();
      expect(auditService.record).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'MESSAGE_READ' }));
    });

    it('denies a user who is neither sender nor recipient — reported as not-found, not forbidden', async () => {
      const messages = [
        { id: 'm1', senderId: 'user-1', recipientId: 'user-2', subject: 'S', body: 'B', readAt: null },
      ];
      const { service, auditService } = makeService(messages, [RECIPIENT]);
      const intruder = makeUser({ id: 'user-3', role: Role.LGA_ADMIN, lgaId: 'lga-9' });

      await expect(service.findOne('m1', intruder)).rejects.toBeInstanceOf(NotFoundException);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'MESSAGE_AUTHORIZATION_DENIED' }),
      );
    });

    it('a guessed/nonexistent message id also reports not-found (no existence leak)', async () => {
      const { service } = makeService([], [RECIPIENT]);
      const actor = makeUser({ id: 'user-1', role: Role.WARD_ADMIN, wardId: 'ward-1' });
      await expect(service.findOne('does-not-exist', actor)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reply', () => {
    it('allows replying to a message the actor participated in', async () => {
      const messages = [
        { id: 'm1', senderId: 'user-2', recipientId: 'user-1', subject: 'Original', body: 'B', readAt: null },
      ];
      const { service } = makeService(messages, [RECIPIENT]);
      const actor = makeUser({ id: 'user-1', role: Role.WARD_ADMIN, wardId: 'ward-1' });

      const reply = await service.create(
        { recipientId: 'user-2', subject: 'Re: Original', body: 'Reply body', parentMessageId: 'm1' } as any,
        [],
        actor,
      );

      expect(reply.parentMessageId).toBe('m1');
    });

    it('rejects a reply referencing a message the actor was never part of', async () => {
      const messages = [
        { id: 'm1', senderId: 'user-2', recipientId: 'user-3', subject: 'Original', body: 'B', readAt: null },
      ];
      const { service } = makeService(messages, [RECIPIENT]);
      const actor = makeUser({ id: 'user-1', role: Role.WARD_ADMIN, wardId: 'ward-1' });

      await expect(
        service.create(
          { recipientId: 'user-2', subject: 'Re: Original', body: 'Reply', parentMessageId: 'm1' } as any,
          [],
          actor,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('unreadCount', () => {
    it('counts only unread, non-deleted messages addressed to the actor', async () => {
      const { service, prisma } = makeService([], [RECIPIENT]);
      prisma.message.count.mockResolvedValue(3);
      const actor = makeUser({ id: 'user-2', role: Role.LGA_ADMIN, lgaId: 'lga-1' });
      await expect(service.unreadCount(actor)).resolves.toEqual({ count: 3 });
      expect(prisma.message.count).toHaveBeenCalledWith({
        where: { recipientId: 'user-2', readAt: null, deletedByRecipient: false },
      });
    });
  });

  describe('attachment access', () => {
    it('denies attachment download to a non-participant', async () => {
      const messages = [
        {
          id: 'm1',
          senderId: 'user-1',
          recipientId: 'user-2',
          subject: 'S',
          body: 'B',
          readAt: null,
          attachments: [{ id: 'att-1' }],
        },
      ];
      const { service } = makeService(messages, [RECIPIENT]);
      const intruder = makeUser({ id: 'user-3', role: Role.LGA_ADMIN, lgaId: 'lga-9' });

      await expect(service.getAttachmentForDownload('m1', 'att-1', intruder)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('allows attachment download to a participant and audits the access', async () => {
      const messages = [
        {
          id: 'm1',
          senderId: 'user-1',
          recipientId: 'user-2',
          subject: 'S',
          body: 'B',
          readAt: null,
          attachments: [{ id: 'att-1', fileName: 'x.pdf', storedFileName: 'uuid.pdf', mimeType: 'application/pdf' }],
        },
      ];
      const { service, prisma, auditService } = makeService(messages, [RECIPIENT]);
      prisma.messageAttachment.findFirst.mockResolvedValue(messages[0].attachments[0]);
      const actor = makeUser({ id: 'user-2', role: Role.LGA_ADMIN, lgaId: 'lga-1' });

      const result = await service.getAttachmentForDownload('m1', 'att-1', actor);

      expect(result.fileName).toBe('x.pdf');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'MESSAGE_ATTACHMENT_ACCESSED' }),
      );
    });
  });
});
