import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';

export interface SocketUser {
  userId: number;
  email: string;
}

// Sockets authenticate by sending their access token in `handshake.auth.token`
// (or the `Authorization` header) - there is no cookie/session to rely on here.
export async function authenticateSocket(
  socket: Socket,
  jwtService: JwtService,
  config: ConfigService,
): Promise<SocketUser> {
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization?.replace('Bearer ', '');

  if (!token) {
    throw new Error('Missing authentication token');
  }

  const payload = await jwtService.verifyAsync(token, {
    secret: config.get<string>('JWT_ACCESS_SECRET'),
  });

  return { userId: payload.sub, email: payload.email };
}
