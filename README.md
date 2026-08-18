# Live Event Platform - Backend

Backend for a live event platform. Users can register/login, create and join live events,
chat in real time inside an event room, and receive notifications when they join an event.

## Tech Stack

- **Framework:** NestJS (TypeScript)
- **Database:** PostgreSQL + Prisma ORM
- **Cache / Queue broker:** Redis
- **Queue:** BullMQ (producer in API, consumer in a separate worker process)
- **Realtime:** Socket.IO (NestJS Gateway) with Redis adapter for multi-instance scaling
- **Auth:** JWT (access + refresh tokens), bcrypt password hashing
- **Docs:** Swagger

## Architecture

```
src/
  auth/           register, login, refresh, logout, JWT strategies & guards
  users/          profile (get/update)
  events/         create/list/detail/join events
  messages/       chat history REST endpoint (paginated)
  chat/           Socket.IO gateway - rooms, live messages, presence, rate limiting
  notifications/  REST endpoint to list a user's notifications
  queue/          BullMQ producer (API) + worker (standalone process)
  redis/          shared Redis client + Socket.IO Redis adapter
  prisma/         Prisma client wrapper
  common/         exception filter, current-user decorator
prisma/
  schema.prisma   database schema (User, Event, EventMember, Message, Notification)
```

Each domain follows Controller -> Service -> Prisma, with DTOs validated by `class-validator`
and a global exception filter for consistent error responses.

## Installation

```bash
npm install
cp .env.example .env   # then fill in real values
npx prisma migrate dev --name init
npm run start:dev
```

Run the notification worker in a separate terminal (it consumes the BullMQ queue):

```bash
npm run worker
```

## Environment Variables

| Variable                 | Description                                   | Example                                  |
|---------------------------|-----------------------------------------------|-------------------------------------------|
| `PORT`                    | HTTP port                                     | `3000`                                    |
| `DATABASE_URL`             | PostgreSQL connection string                  | `postgresql://user:pass@localhost:5432/db`|
| `REDIS_HOST`               | Redis host                                    | `localhost`                               |
| `REDIS_PORT`               | Redis port                                    | `6379`                                    |
| `JWT_ACCESS_SECRET`        | Secret used to sign access tokens             | any random string                         |
| `JWT_ACCESS_EXPIRES_IN`    | Access token lifetime                         | `15m`                                     |
| `JWT_REFRESH_SECRET`       | Secret used to sign refresh tokens            | any random string                         |
| `JWT_REFRESH_EXPIRES_IN`   | Refresh token lifetime                        | `7d`                                      |

## Running with Docker

```bash
docker-compose up --build
```

This starts PostgreSQL, Redis, the API (which runs migrations on startup) and the
notification worker, all wired together.

## API Documentation

Swagger UI is exposed at `http://localhost:3000/docs` once the server is running.

### Auth

| Method | Path             | Auth        | Body                                  |
|--------|------------------|-------------|----------------------------------------|
| POST   | `/auth/register` | none        | `{ name, email, password }`            |
| POST   | `/auth/login`    | none        | `{ email, password }`                  |
| POST   | `/auth/refresh`  | refresh JWT | -                                       |
| POST   | `/auth/logout`   | refresh JWT | -                                       |

Register/Login response:

```json
{
  "user": { "id": 1, "name": "John Doe", "email": "john@example.com", "createdAt": "..." },
  "accessToken": "...",
  "refreshToken": "..."
}
```

### Users

| Method | Path         | Auth        | Body                       |
|--------|--------------|-------------|------------------------------|
| GET    | `/users/me`  | access JWT  | -                             |
| PUT    | `/users/me`  | access JWT  | `{ name?, email? }`           |

### Events

| Method | Path                    | Auth        | Body / Query                          |
|--------|-------------------------|-------------|-----------------------------------------|
| POST   | `/events`               | access JWT  | `{ title, description }`                |
| GET    | `/events`               | none        | `?page=1&limit=10`                      |
| GET    | `/events/:id`           | none        | -                                        |
| POST   | `/events/:id/join`      | access JWT  | -                                        |

`POST /events` example:

```json
{ "title": "Football Match", "description": "Live Match Discussion" }
```

Joining an event enqueues a background job that writes a notification row
(`User <name> joined Event <title>`), processed asynchronously by the worker.

### Chat history

| Method | Path                         | Auth        | Query               |
|--------|-------------------------------|-------------|-----------------------|
| GET    | `/events/:id/messages`        | access JWT  | `?page=1&limit=20`    |

### Notifications

| Method | Path              | Auth       |
|--------|-------------------|------------|
| GET    | `/notifications`  | access JWT |

## WebSocket (Socket.IO)

Connect with the access token:

```js
const socket = io('http://localhost:3000', {
  auth: { token: '<accessToken>' },
});
```

Client events (emit):

- `joinEventRoom` — `{ eventId }` — joins room `event:<eventId>`, updates presence
- `leaveEventRoom` — `{ eventId }`
- `sendMessage` — `{ eventId, message }` — persists the message and broadcasts it

Server events (listen):

- `receiveMessage` — `{ id, eventId, userId, userName, message, createdAt }`
- `presence:update` — `{ eventId, onlineUsers }`
- `error` — `{ message }` (auth failure, invalid payload, rate limit exceeded)

Chat rate limit: **max 10 messages per minute per user**, enforced with a Redis
counter (`ratelimit:chat:<userId>`) that resets every 60 seconds.

## Database Design

- `User` — account + hashed password + hashed refresh token
- `Event` — created by a `User`
- `EventMember` — join table (`eventId`, `userId`, `joinedAt`), unique per `(eventId, userId)`
- `Message` — chat history, indexed on `(eventId, createdAt)` for fast paginated reads
- `Notification` — persisted async notifications, indexed on `userId`

## Queue

- **Producer:** `EventsService.join()` enqueues a `user-joined-event` job on the
  `notifications` BullMQ queue (Redis-backed) after the membership row is created.
- **Worker:** `src/queue/notification.worker.ts` runs as its own process, consumes
  the queue, logs the notification, and writes it to the `Notification` table.
  Retries 3 times with exponential backoff on failure.

## Security

- Passwords hashed with bcrypt (10 salt rounds)
- Refresh tokens hashed before storage (a leaked DB dump can't be replayed as a session)
- Access/refresh tokens signed with separate secrets
- Global `ValidationPipe` (whitelist + forbid unknown fields) on all REST input
- REST rate limiting via `@nestjs/throttler` (100 req/min default), plus a dedicated
  Redis-backed limiter for chat messages
- WebSocket connections rejected unless a valid access token is supplied
