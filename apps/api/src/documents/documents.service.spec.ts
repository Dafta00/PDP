import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { DocumentsService } from './documents.service';
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

const RESTRICTED_DOC = {
  id: 'doc-restricted',
  title: 'Executive Committee Minutes',
  restrictedToAdmins: true,
  storedFileName: 'a.pdf',
  uploadedById: 'admin-1',
  fileName: 'minutes.pdf',
  mimeType: 'application/pdf',
};

const PUBLIC_DOC = {
  id: 'doc-public',
  title: 'Membership Form',
  restrictedToAdmins: false,
  storedFileName: 'b.pdf',
  uploadedById: 'admin-1',
  fileName: 'form.pdf',
  mimeType: 'application/pdf',
};

function makeService(docs: any[]) {
  const prisma: any = {
    document: {
      findFirst: jest.fn(async ({ where }: any) => docs.find((d) => d.id === where.id) ?? null),
      findMany: jest.fn(async ({ where }: any) =>
        docs.filter((d) => (where.restrictedToAdmins === false ? !d.restrictedToAdmins : true)),
      ),
      count: jest.fn(async () => docs.length),
      update: jest.fn(async ({ data }: any) => ({ ...docs[0], ...data })),
    },
  };
  const auditService = { record: jest.fn() };
  const service = new DocumentsService(prisma, auditService as any);
  return { service, auditService, prisma };
}

describe('DocumentsService visibility', () => {
  it('hides restricted documents from a non-admin listing', async () => {
    const { service } = makeService([RESTRICTED_DOC, PUBLIC_DOC]);
    const wardAdmin = makeUser({ role: Role.WARD_ADMIN });

    const result = await service.findAll({}, wardAdmin);

    expect(result.items.map((d: any) => d.id)).toEqual(['doc-public']);
  });

  it('includes restricted documents for a top-level admin listing', async () => {
    const { service } = makeService([RESTRICTED_DOC, PUBLIC_DOC]);
    const superAdmin = makeUser({ role: Role.SUPER_ADMIN });

    const result = await service.findAll({}, superAdmin);

    expect(result.items.map((d: any) => d.id).sort()).toEqual(['doc-public', 'doc-restricted']);
  });

  it('reports a restricted document as not found (not forbidden) to a non-admin fetching it directly', async () => {
    const { service } = makeService([RESTRICTED_DOC]);
    const wardAdmin = makeUser({ role: Role.WARD_ADMIN });

    await expect(service.findOne('doc-restricted', wardAdmin)).rejects.toThrow(NotFoundException);
  });

  it('lets a top-level admin fetch a restricted document', async () => {
    const { service } = makeService([RESTRICTED_DOC]);
    const superAdmin = makeUser({ role: Role.SUPER_ADMIN });

    const doc = await service.findOne('doc-restricted', superAdmin);
    expect(doc.id).toBe('doc-restricted');
  });

  it('blocks a non-admin from downloading a restricted document', async () => {
    const { service } = makeService([RESTRICTED_DOC]);
    const wardAdmin = makeUser({ role: Role.WARD_ADMIN });

    await expect(service.getFileForDownload('doc-restricted', wardAdmin)).rejects.toThrow(NotFoundException);
  });

  it('audits every download of a restricted document', async () => {
    const { service, auditService } = makeService([RESTRICTED_DOC]);
    const superAdmin = makeUser({ role: Role.SUPER_ADMIN });

    await service.getFileForDownload('doc-restricted', superAdmin);

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'RESTRICTED_DOCUMENT_DOWNLOADED' }),
    );
  });

  it('does not audit downloads of a public document', async () => {
    const { service, auditService } = makeService([PUBLIC_DOC]);
    const puOfficer = makeUser({ role: Role.POLLING_UNIT_OFFICER });

    await service.getFileForDownload('doc-public', puOfficer);

    expect(auditService.record).not.toHaveBeenCalled();
  });
});

describe('DocumentsService management permission', () => {
  it('lets the original uploader update their own document even without an admin role', async () => {
    const { service } = makeService([PUBLIC_DOC]);
    const uploader = makeUser({ id: 'admin-1', role: Role.WARD_ADMIN });

    await expect(service.update('doc-public', { title: 'Updated' }, uploader)).resolves.toBeDefined();
  });

  it('refuses a user with no manage role from updating someone else\'s document', async () => {
    const { service } = makeService([PUBLIC_DOC]);
    const otherUser = makeUser({ id: 'someone-else', role: Role.POLLING_UNIT_OFFICER });

    await expect(service.update('doc-public', { title: 'Hijacked' }, otherUser)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('lets a top-level admin manage any document regardless of uploader', async () => {
    const { service } = makeService([PUBLIC_DOC]);
    const superAdmin = makeUser({ id: 'someone-else', role: Role.SUPER_ADMIN });

    await expect(service.update('doc-public', { title: 'Updated' }, superAdmin)).resolves.toBeDefined();
  });
});
