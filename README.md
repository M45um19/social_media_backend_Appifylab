# Buddy Script - Social Media Web Application Backend (Modular Monolith)

This project is an Enterprise-Grade Modular Monolith backend application built with Node.js, Express, TypeScript, Kafka, and Redis.

## Core Architectural Blueprint

The codebase enforces a strict Controller-Service-Repository pattern and isolates HTTP processes from event-driven background worker processes.

### 1. Process Isolation

- **HTTP API Server (`src/server.ts`)**: Main entry point for the HTTP API server. It initializes Express and listens for requests. It does not start any Kafka consumer handlers.
- **Background Worker (`src/worker.ts`)**: Standalone background worker process. It initializes Kafka consumers to handle async workflows. It does not spin up HTTP listeners or load the Express application.

### 2. Layered Architecture (Inside `src/modules/[featureName]/`)

- **Controller (`*.controller.ts`)**: Responsible for HTTP serialization, query/param parsing, and invoking service layers. Uses `catchAsync` and zero business logic.
- **Service (`*.service.ts`)**: The home of business logic, orchestrating database transactions via repositories, invalidating caches, and emitting events.
- **Repository (`*.repository.ts`)**: The only layer allowed to query the Database Model (`*.model.ts`).
- **Outbound Events (`*.events.ts`)**: Home for publishing Kafka events.

---

## Architectural Design & Tech Stack Choices

### 1. Redis Caching System (Why & Where)

- **Why**: Redis provides ultra-fast in-memory lookup capabilities, minimizing authentication validation latency, tracking active client sessions/devices, and securing refresh token metadata with native TTL expiry.
- **Where**:
  - **User Data Hash (`user:<userId>:data`)**: Stores user profile info in a `profile` field (persisted as a JSON DTO), alongside device session mappings in separate `session:<deviceId>` fields. The key expires after 7 days matching the active session length, providing multi-device session security and preventing concurrent session write race conditions.
  - **Post Data Hash (`post:<postId>:data`)**: Stores post metadata and media URLs with a 30-minute sliding window TTL.
  - **Global Feed Sorted Set (`global_feed`)**: A Redis Sorted Set (ZSET) storing post IDs indexed chronologically by creation timestamp score, supporting cursor-based range query pagination.

### 2. Kafka Event Streaming (Why & Where)

- **Why**: Kafka serves as our distributed message broker enabling decoupled, asynchronous event handling. By moving execution logic (like sending welcome emails) outside of the HTTP thread request cycle, response latencies are kept to a minimum.
- **Where**:
  - **User Registration Event (`auth.user-registered`)**: When registration completes, the service dispatches an outbound event using `authEvents.emitUserRegistered()` and immediately returns HTTP 201 with the JWTs.
  - **Welcome Email Consumer (`src/kafka/auth.consumer.ts`)**: Executed inside the worker process, this consumer subscribes to the registration topic, processes incoming payloads, and triggers the `sendMail` utility asynchronously.
  - **Post Created Event (`posts.post-created`)**: Dispatched from the service layer upon successful database insertion and Redis caching, passing the new post meta-information for asynchronous consumer actions.

---

## Getting Started

### Prerequisites

- Node.js (v22 or higher)
- Docker & Docker Compose

### Environmental Variables

Create a `.env` file in the root directory:

```env
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://127.0.0.1:27017/social_media
REDIS_URL=redis://127.0.0.1:6379
KAFKA_BROKERS=127.0.0.1:9092
JWT_ACCESS_SECRET=your_jwt_access_secret_key
JWT_REFRESH_SECRET=your_jwt_refresh_secret_key
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

### Run Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Build the TypeScript application:
   ```bash
   npm run build
   ```
3. Run HTTP server in development mode:
   ```bash
   npm run dev
   ```
4. Run background worker:
   ```bash
   npm run worker
   ```

### Run via Docker Compose

To boot up the complete architecture including MongoDB, Redis, KRaft Kafka broker, the API server, and the consumer worker:

```bash
docker-compose up --build
```

---

## API Endpoints

### Authentication Module

#### Register User
- **URL**: `/api/v1/auth/register`
- **Method**: `POST`
- **Headers**:
  - `Content-Type: application/json`
  - `User-Agent: <client-user-agent>` (Optional)
- **Body**:
  ```json
  {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "password": "StrongPassword123"
  }
  ```
- **Success Response (201 Created)**:
  ```json
  {
    "success": true,
    "statusCode": 201,
    "message": "User registered successfully",
    "data": {
      "accessToken": "<access_token_jwt>",
      "refreshToken": "<refresh_token_jwt>",
      "deviceId": "<generated_uuid>",
      "user": {
        "id": "<user_id>",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john.doe@example.com",
        "profilePicture": "https://www.gravatar.com/avatar/...?d=robohash&s=200",
        "createdAt": "2026-07-12T07:31:10.042Z"
      }
    }
  }
  ```

#### Login User
- **URL**: `/api/v1/auth/login`
- **Method**: `POST`
- **Headers**:
  - `Content-Type: application/json`
  - `User-Agent: <client-user-agent>` (Optional)
- **Body**:
  ```json
  {
    "email": "john.doe@example.com",
    "password": "StrongPassword123"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "User logged in successfully",
    "data": {
      "accessToken": "<access_token_jwt>",
      "refreshToken": "<refresh_token_jwt>",
      "deviceId": "<generated_uuid>",
      "user": {
        "id": "<user_id>",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john.doe@example.com",
        "profilePicture": "https://www.gravatar.com/avatar/...?d=robohash&s=200",
        "createdAt": "2026-07-12T07:31:10.042Z"
      }
  }
}
```

#### Logout User
- **URL**: `/api/v1/auth/logout`
- **Method**: `POST`
- **Headers**:
  - `Content-Type: application/json`
  - `Authorization: Bearer <access_token_jwt>`
- **Body**:
  ```json
  {
    "deviceId": "<generated_uuid>"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Logged out successfully"
  }
  ```

#### Refresh Token
- **URL**: `/api/v1/auth/refresh-token`
- **Method**: `POST`
- **Headers**:
  - `Content-Type: application/json`
- **Body**:
  ```json
  {
    "refreshToken": "<refresh_token_jwt>",
    "deviceId": "<generated_uuid>"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Tokens refreshed successfully",
    "data": {
      "accessToken": "<new_access_token_jwt>",
      "refreshToken": "<new_refresh_token_jwt>",
      "deviceId": "<generated_uuid>"
    }
  }
  ```

### Post Module

#### Generate Presigned URL
- **URL**: `/api/v1/posts/presigned-url`
- **Method**: `POST`
- **Headers**:
  - `Content-Type: application/json`
  - `Authorization: Bearer <access_token_jwt>`
- **Body**:
  ```json
  {
    "resourceType": "image",
    "size": 5242880,
    "format": "png"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Cloudinary upload signature generated successfully",
    "data": {
      "signature": "5c9fa5de91c7f121c882e5a2f720033b025c1341",
      "timestamp": 1783927135,
      "folder": "posts",
      "publicId": "019f5a57-db58-73f5-8519-667f97a33a9f",
      "resourceType": "image",
      "apiKey": "mock-api-key",
      "cloudName": "mock-cloud-name"
    }
  }
  ```

#### Create Post
- **URL**: `/api/v1/posts`
- **Method**: `POST`
- **Headers**:
  - `Content-Type: application/json`
  - `Authorization: Bearer <access_token_jwt>`
- **Body**:
  ```json
  {
    "content": "This is my first post!",
    "mediaUrls": ["https://res.cloudinary.com/demo/image/upload/v1582260278/posts/sample.png"]
  }
  ```
- **Success Response (201 Created)**:
  ```json
  {
    "success": true,
    "statusCode": 201,
    "message": "Post created successfully",
    "data": {
      "id": "019f5a57-db58-73f5-8519-667f97a33a9f",
      "userId": "user_id_here",
      "content": "This is my first post!",
      "mediaUrls": ["https://res.cloudinary.com/demo/image/upload/v1582260278/posts/sample.png"],
      "likesCount": 0,
      "commentsCount": 0,
      "createdAt": "2026-07-13T07:18:55.070Z",
      "updatedAt": "2026-07-13T07:18:55.070Z",
      "user": {
        "firstName": "John",
        "lastName": "Doe",
        "profilePicture": "https://www.gravatar.com/avatar/...?d=robohash&s=200"
      }
    }
  }
  ```

#### Retrieve Global Feed
- **URL**: `/api/v1/posts`
- **Method**: `GET`
- **Query Parameters**:
  - `limit`: `10` (Optional, default: 10, max: 100)
  - `cursor`: `<timestamp_ms_score>` (Optional)
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Global feed retrieved successfully",
    "data": {
      "posts": [
        {
          "id": "019f5a57-db58-73f5-8519-667f97a33a9f",
          "userId": "user_id_here",
          "content": "This is my first post!",
          "mediaUrls": ["https://res.cloudinary.com/demo/image/upload/v1582260278/posts/sample.png"],
          "likesCount": 0,
          "commentsCount": 0,
          "createdAt": "2026-07-13T07:18:55.070Z",
          "updatedAt": "2026-07-13T07:18:55.070Z",
          "user": {
            "firstName": "John",
            "lastName": "Doe",
            "profilePicture": "https://www.gravatar.com/avatar/...?d=robohash&s=200"
          }
        }
      ],
      "nextCursor": "1783927135070"
    }
  }
  ```
