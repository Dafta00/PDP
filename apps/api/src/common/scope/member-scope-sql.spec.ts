import { memberScopeToSql } from './member-scope-sql';

describe('memberScopeToSql', () => {
  it('produces an always-true fragment for unrestricted scope', () => {
    const sql = memberScopeToSql({});
    expect(sql.sql).toBe('TRUE');
  });

  it('scopes to LGAs within a senatorial district when present', () => {
    const sql = memberScopeToSql({ lga: { senatorialDistrictId: 'district-1' } });
    expect(sql.sql).toContain('"lgaId" IN (SELECT id FROM "LGA" WHERE "senatorialDistrictId" =');
    expect(sql.values).toEqual(['district-1']);
  });

  it('scopes to lgaId when present', () => {
    const sql = memberScopeToSql({ lgaId: 'lga-1' });
    expect(sql.sql).toContain('"lgaId" =');
    expect(sql.values).toEqual(['lga-1']);
  });

  it('scopes to wardId when present', () => {
    const sql = memberScopeToSql({ wardId: 'ward-1' });
    expect(sql.sql).toContain('"wardId" =');
    expect(sql.values).toEqual(['ward-1']);
  });

  it('scopes to pollingUnitId when present', () => {
    const sql = memberScopeToSql({ pollingUnitId: 'pu-1' });
    expect(sql.sql).toContain('"pollingUnitId" =');
    expect(sql.values).toEqual(['pu-1']);
  });

  it('produces an always-false fragment for the no-access sentinel', () => {
    const sql = memberScopeToSql({ id: '__no_access__' });
    expect(sql.sql).toBe('FALSE');
  });
});
