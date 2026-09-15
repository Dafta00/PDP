import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const PREFIX = 'PDP-GC';

/**
 * Generates unique, human-readable, never-reused membership IDs:
 * PDP-GC-2026-000001. Uses an atomic per-year counter row so concurrent
 * registrations never collide, without needing to hold a table lock.
 */
@Injectable()
export class MembershipIdService {
  constructor(private readonly prisma: PrismaService) {}

  async next(year: number = new Date().getFullYear()): Promise<string> {
    const key = `member-${year}`;
    const counter = await this.prisma.counter.upsert({
      where: { id: key },
      create: { id: key, value: 1 },
      update: { value: { increment: 1 } },
    });
    const sequence = counter.value.toString().padStart(6, '0');
    return `${PREFIX}-${year}-${sequence}`;
  }
}
