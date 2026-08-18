import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListMessagesDto } from './dto/list-messages.dto';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(eventId: number, userId: number, message: string) {
    return this.prisma.message.create({
      data: { eventId, userId, message },
      include: { user: { select: { id: true, name: true } } },
    });
  }

  async listForEvent(eventId: number, query: ListMessagesDto) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const skip = (query.page - 1) * query.limit;

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { eventId },
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true } } },
      }),
      this.prisma.message.count({ where: { eventId } }),
    ]);

    return {
      data: messages,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}
