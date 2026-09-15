import { Prisma } from '@prisma/client';

/**
 * Translates the object `OrgScopeService.memberScopeWhere` returns into a
 * safe, parameterized SQL fragment for the raw queries that Prisma's
 * query builder can't express (e.g. GROUP BY month). Values are bound as
 * query parameters via `Prisma.sql`, never string-concatenated, so this
 * carries no injection risk despite being raw SQL.
 */
export function memberScopeToSql(scope: Prisma.MemberWhereInput): Prisma.Sql {
  if ('lgaId' in scope && scope.lgaId) return Prisma.sql`"lgaId" = ${scope.lgaId}`;
  if ('wardId' in scope && scope.wardId) return Prisma.sql`"wardId" = ${scope.wardId}`;
  if ('pollingUnitId' in scope && scope.pollingUnitId) {
    return Prisma.sql`"pollingUnitId" = ${scope.pollingUnitId}`;
  }
  if ('id' in scope) return Prisma.sql`FALSE`; // no-access sentinel from memberScopeWhere
  return Prisma.sql`TRUE`; // unrestricted
}
