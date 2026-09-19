import { EducationLevel } from './types';

export const EDUCATION_LEVEL_OPTIONS: { value: EducationLevel; label: string }[] = [
  { value: 'NO_FORMAL_EDUCATION', label: 'No Formal Education' },
  { value: 'PRIMARY', label: 'Primary' },
  { value: 'SECONDARY', label: 'Secondary' },
  { value: 'NCE', label: 'NCE' },
  { value: 'ND', label: 'ND' },
  { value: 'HND', label: 'HND' },
  { value: 'BACHELORS_DEGREE', label: "Bachelor's Degree" },
  { value: 'POSTGRADUATE_DIPLOMA', label: 'Postgraduate Diploma' },
  { value: 'MASTERS_DEGREE', label: "Master's Degree" },
  { value: 'PHD', label: 'PhD' },
  { value: 'OTHER', label: 'Other' },
];

const EDUCATION_LEVEL_LABELS: Record<EducationLevel, string> = Object.fromEntries(
  EDUCATION_LEVEL_OPTIONS.map((o) => [o.value, o.label]),
) as Record<EducationLevel, string>;

export function educationLevelLabel(level: EducationLevel | null | undefined): string {
  if (!level) return '—';
  return EDUCATION_LEVEL_LABELS[level] ?? level;
}
