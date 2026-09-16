import { SetMetadata } from '@nestjs/common';
import { Permission } from '../authorization/permissions';

export const PERMISSIONS_KEY = 'permissions';

/** Any one of the listed permissions is sufficient — combine with @Roles for the coarse-grained gate; this is the fine-grained one. */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);
