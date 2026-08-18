import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { authenticateSocket, SocketUser } from './ws-jwt.util';
import { SendMessageDto } from './dto/send-message.dto';
import { MessagesService } from '../messages/messages.service';
import { RedisService } from '../redis/redis.service';

const MAX_MESSAGES_PER_WINDOW = 10;
const RATE_LIMIT_WINDOW_SECONDS = 60;

function eventRoom(eventId: number) {
  return `event:${eventId}`;
}

function presenceKey(eventId: number) {
  return `presence:event:${eventId}`;
}

function rateLimitKey(userId: number) {
  return `ratelimit:chat:${userId}`;
}

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly messagesService: MessagesService,
    private readonly redisService: RedisService,
  ) {}

  async handleConnection(socket: Socket) {
    try {
      const user = await authenticateSocket(socket, this.jwtService, this.config);
      socket.data.user = user;
      this.logger.log(`Socket connected: user=${user.userId} socket=${socket.id}`);
    } catch (err) {
      this.logger.warn(`Unauthorized socket connection rejected: ${(err as Error).message}`);
      socket.emit('error', { message: 'Unauthorized' });
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: Socket) {
    const joinedEventIds: number[] = socket.data.joinedEventIds || [];
    for (const eventId of joinedEventIds) {
      await this.leaveEventRoom(socket, eventId);
    }
  }

  @SubscribeMessage('joinEventRoom')
  async handleJoinEventRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { eventId: number },
  ) {
    const user: SocketUser = socket.data.user;
    const eventId = Number(data.eventId);
    const room = eventRoom(eventId);

    await socket.join(room);
    socket.data.joinedEventIds = [...(socket.data.joinedEventIds || []), eventId];

    const onlineCount = await this.redisService.client.sadd(
      presenceKey(eventId),
      String(user.userId),
    );
    const total = await this.redisService.client.scard(presenceKey(eventId));

    this.server.to(room).emit('presence:update', { eventId, onlineUsers: total });
    this.logger.log(`user=${user.userId} joined room=${room}`);
    return { room, onlineUsers: total };
  }

  @SubscribeMessage('leaveEventRoom')
  async handleLeaveEventRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { eventId: number },
  ) {
    return this.leaveEventRoom(socket, Number(data.eventId));
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { eventId: number; message: string },
  ) {
    const user: SocketUser = socket.data.user;

    const dto = plainToInstance(SendMessageDto, body);
    const errors = await validate(dto);
    if (errors.length > 0) {
      socket.emit('error', { message: 'Invalid message payload' });
      return;
    }

    const allowed = await this.checkRateLimit(user.userId);
    if (!allowed) {
      socket.emit('error', { message: 'Rate limit exceeded: max 10 messages per minute' });
      return;
    }

    const saved = await this.messagesService.create(dto.eventId, user.userId, dto.message);

    this.server.to(eventRoom(dto.eventId)).emit('receiveMessage', {
      id: saved.id,
      eventId: dto.eventId,
      userId: user.userId,
      userName: saved.user.name,
      message: saved.message,
      createdAt: saved.createdAt,
    });
  }

  private async leaveEventRoom(socket: Socket, eventId: number) {
    const user: SocketUser | undefined = socket.data.user;
    const room = eventRoom(eventId);
    await socket.leave(room);
    socket.data.joinedEventIds = (socket.data.joinedEventIds || []).filter(
      (id: number) => id !== eventId,
    );

    if (user) {
      await this.redisService.client.srem(presenceKey(eventId), String(user.userId));
      const total = await this.redisService.client.scard(presenceKey(eventId));
      this.server.to(room).emit('presence:update', { eventId, onlineUsers: total });
    }
  }

  // Sliding-window-ish fixed window limiter: first message in a window sets a 60s TTL,
  // subsequent messages just increment until the TTL expires and the window resets.
  private async checkRateLimit(userId: number): Promise<boolean> {
    const key = rateLimitKey(userId);
    const count = await this.redisService.client.incr(key);
    if (count === 1) {
      await this.redisService.client.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }
    return count <= MAX_MESSAGES_PER_WINDOW;
  }
}
