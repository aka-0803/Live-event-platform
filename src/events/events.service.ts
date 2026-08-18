import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationProducer } from '../queue/notification.producer';
import { CreateEventDto } from './dto/create-event.dto';
import { ListEventsDto } from './dto/list-events.dto';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationProducer: NotificationProducer,
  ) {}

  async create(userId: number, dto: CreateEventDto) {
    return this.prisma.event.create({
      data: {
        title: dto.title,
        description: dto.description,
        createdById: userId,
      },
    });
  }

  async findAll(query: ListEventsDto) {
    const skip = (query.page - 1) * query.limit;

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { members: true } } },
      }),
      this.prisma.event.count(),
    ]);

    return {
      data: events,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(eventId: number) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { members: true, messages: true } },
      },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  async join(eventId: number, userId: number) {
    const [event, user] = await Promise.all([
      this.prisma.event.findUnique({ where: { id: eventId } }),
      this.prisma.user.findUnique({ where: { id: userId } }),
    ]);
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const alreadyJoined = await this.prisma.eventMember.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (alreadyJoined) {
      throw new ConflictException('User has already joined this event');
    }

    const membership = await this.prisma.eventMember.create({
      data: { eventId, userId },
    });

    // Fire-and-forget: notification is processed asynchronously by the worker
    await this.notificationProducer.addJoinEventJob({
      userId,
      userName: user.name,
      eventId,
      eventTitle: event.title,
    });

    return membership;
  }
}
