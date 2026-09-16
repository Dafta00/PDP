import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Gombe Central kept its original counter key ("member-<year>", no district
// suffix) so IDs already issued before the state-wide expansion stay in
// exactly the same sequence. North/South get their own counters from day
// one — a district's registration volume never affects another's numbering.
const DISTRICT_CODES: Record<string, string> = {
  'Gombe Central': 'GC',
  'Gombe North': 'GN',
  'Gombe South': 'GS',
};

/**
 * Generates unique, human-readable, never-reused membership IDs:
 * PDP-GC-2026-000001. Uses an atomic per-district-per-year counter row so
 * concurrent registrations never collide, without needing to hold a table lock.
 */
@Injectable()
export class MembershipIdService {
  constructor(private readonly prisma: PrismaService) {}

  async next(districtName: string, year: number = new Date().getFullYear()): Promise<string> {
    const code = DISTRICT_CODES[districtName] ?? 'GC';
    const key = code === 'GC' ? `member-${year}` : `member-${year}-${code}`;
    const counter = await this.prisma.counter.upsert({
      where: { id: key },
      create: { id: key, value: 1 },
      update: { value: { increment: 1 } },
    });
    const sequence = counter.value.toString().padStart(6, '0');
    return `PDP-${code}-${year}-${sequence}`;
  }
}
