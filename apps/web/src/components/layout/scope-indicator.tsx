import { Role, ScopePath, UNRESTRICTED_ROLES } from '@/lib/auth-context';

/** "Gombe Central / Akko / Kumo Central" — as deep as the user's scope goes. */
export function scopeBreadcrumb(scopePath?: ScopePath): string[] {
  if (!scopePath) return [];
  return [scopePath.senatorialDistrict, scopePath.lga, scopePath.ward, scopePath.pollingUnit]
    .filter((unit): unit is { id: string; name: string } => !!unit)
    .map((unit) => unit.name);
}

export function ScopeLine({
  role,
  scopePath,
  className,
}: {
  role: Role;
  scopePath?: ScopePath;
  className?: string;
}) {
  const parts = scopeBreadcrumb(scopePath);
  const label = UNRESTRICTED_ROLES.includes(role) ? 'State-Wide Access' : parts.join(' / ') || 'Unassigned scope';

  return (
    <p className={className} title={label}>
      {label}
    </p>
  );
}
