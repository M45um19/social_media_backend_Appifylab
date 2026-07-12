Purpose & Scope

This project is an Enterprise-Grade Modular Monolith built with Node.js, Express, TypeScript, Kafka, and Redis. Every AI assistant working on this codebase must strictly adhere to the patterns, architectures, and boundaries defined below to ensure high performance, isolation, and zero architectural drift.

Core Architectural Blueprint

We enforce a strict Controller-Service-Repository pattern and isolate HTTP processes from event-driven background worker processes.
1. Separation of Entry Points

    src/server.ts: The main entry point for the HTTP API server. It initializes app.ts and listens for HTTP/gRPC requests. Never initiate Kafka consumers here.

    src/worker.ts: The standalone background process entry point. It calls the orchestration hub in src/kafka/index.ts to boot all event consumers. Never load app.ts or instantiate HTTP listeners here.

2. The Clean Layered Architecture (Inside src/modules/[featureName]/)

AI must write code strictly within these designated boundaries:

    Controller (*.controller.ts): Responsible only for HTTP serialization. Parses req.body/query/params, calls the appropriate Service method, and hands off the output to sendResponse. Must use catchAsync wrapper. Zero business logic.

    Service (*.service.ts): The core home of business logic. Orchestrates domain actions. Services are infrastructure-agnostic; they are called by both Controllers (HTTP) and Consumers (Kafka). Never write raw Mongoose/DB queries here.

    Repository (*.repository.ts): The only layer allowed to talk directly to the Database Model (*.model.ts). If data storage changes, only this file should match the modification.

    Outbound Events (*.events.ts): The dedicated home for Kafka producer actions. When a service finishes an operation that other systems need to know about, it invokes a method from this file to publish messages.

Distributed Systems Protocols (Kafka & Redis)
1. Kafka Inbound Handling (Consumers)

    Centralized Dispatch: All Kafka consumers reside in the global src/kafka/ directory ([featureName].consumer.ts).

    Execution Flow: When an inbound event is consumed:

        The consumer parses the payload inside src/kafka/[featureName].consumer.ts.

        It directly dispatches the parsed payload to the respective Domain Service (src/modules/[featureName]/[featureName].service.ts).

    Config Location: Constants like Topic Names and Consumer Group IDs must be fetched from the feature's local constants file (src/modules/[featureName]/[featureName].constants.ts).

2. Redis Usage Guidelines

AI must implement Redis based on the explicit context provided by the tech lead:

    Caching Strategy: Use Redis exclusively for read-heavy operations. Always implement a Cache-Aside pattern in the Service layer, wrapping database calls behind repository layers.

    State & Tracking: For real-time geospatial processing or transient socket state tracking, write dedicated Redis wrappers.

    Data Integrity: Every cached key must have a explicitly defined TTL (Time-To-Live). Always invalidate or update the cache within the Service layer during write operations (Mutations).

Strict Restrictions (Crucial Guardrails)

    No Cross-Module Database Access: src/modules/featureA must never import featureB.model.ts or featureB.repository.ts. If featureA needs data from featureB, it must go through featureB.service.ts or communicate asynchronously via Kafka events.

    Express 5 / Async Safe Mutation: When mutating or extracting incoming payloads within middlewares (like Zod validateRequest), never re-assign req.query or req.params directly as they may behave as read-only getters. Use Object.assign(req.query, validatedData) instead.

    Mongoose Password Security: Database password fields must have select: false initialized in their models. When fetching data during authentication, explicitly call .select("+password") in the repository layer, and clone/sanitize the output to ensure the raw hash is never leaked past the Service boundaries.

Code Style & Formatting Mandates

    Modular Monolith Compliance: Do not generate global files for constants, interfaces, or templates. Keep them tightly bound inside src/modules/[featureName]/.

    Strict Typing: Do not use any. Explicitly declare return signatures for every async Service, Controller, and Repository function.

    Error Handling: Never swallow errors using silent catch blocks. Throw an operational error via the AppError utility class, ensuring it propagates seamlessly to globalError.middleware.ts.

    Path Mappings: Always use explicit relative ES module extensions (e.g., import { Something } from "./something.js";) to comply with compiling targets.

How to Execute Code Ingestion

    Instruction to AI Agent: Before implementing any requested feature, scan the src/modules/ directory. If the feature involves database updates, create the .repository.ts first. If it involves asynchronous events, write the producer method inside .events.ts and ensure the consumer logic handles it via src/kafka/. Verify that server.ts and worker.ts remain isolated at all times.


Project Strcture

├── dist/                          # Compiled production code (Build Output)
├── src/
│   ├── app.ts                     # Express app initialization and global middleware setup
│   ├── server.ts                  # HTTP API server entry point (Main Process)
│   ├── worker.ts                  # Background process/Kafka consumer entry point (Worker Process)
│   │
│   ├── config/                    # Global configurations and third-party client initializations
│   │   ├── env.ts                 # Type-safe environment variable validation using Zod
│   │   ├── db.ts                  # Database connectivity logic (Mongoose/MongoDB connection)
│   │   └── kafka.ts               # Core Kafka client (Producer/Consumer) instantiation configuration
│   │
│   ├── kafka/                     # Central Kafka inbound layer (Connection & registration hub)
│   │   ├── index.ts               # Master worker orchestration (Connects and runs all consumers)
│   │   └── [featureName].consumer.ts # Feature-specific Kafka event listeners (Dispatches tasks to services)
│   │
│   ├── middlewares/               # Application-wide Express middlewares
│   │   ├── auth.middleware.ts     # Request authentication and Role-Based Access Control (RBAC)
│   │   ├── globalError.middleware.ts # Centralized global error handling pipeline
│   │   └── validation.middleware.ts # Zod schema validation middleware for incoming requests
│   │
│   ├── modules/                   # Pure Modular Monolith domains (Highly self-contained)
│   │   └── [featureName]/         # Isolated directory for a standalone domain/feature
│   │       ├── [featureName].controller.ts # 1. Controller (Handles HTTP requests and API responses)
│   │       ├── [featureName].service.ts    # 2. Service (Core business logic - shared by HTTP & Kafka)
│   │       ├── [featureName].repository.ts # 3. Repository (Direct database access and raw queries layer)
│   │       ├── [featureName].model.ts      # Database schema and ORM/ODM model definitions
│   │       ├── [featureName].interface.ts  # TypeScript types, interfaces, and DTO declarations
│   │       ├── [featureName].constants.ts  # Feature-scoped Kafka topics, group IDs, and static records
│   │       ├── [featureName].routes.ts     # Express endpoint routing declarations
│   │       ├── [featureName].validation.ts # Input validation schemas (Zod request rules)
│   │       ├── [featureName].template.ts   # (Optional) Feature-specific markup or HTML email templates
│   │       └── [featureName].events.ts     # Feature outbound events (Kafka producer invocation methods)
│   │
│   ├── routes/                    # Centralized routing registry hub
│   │   └── index.ts               # Main router mapping and binding all modular feature routes
│   │
│   ├── types/                     # Global ambient TypeScript declarations
│   │   └── index.d.ts             # Express Request overrides and global module augmentations
│   │
│   └── utils/                     # Project-wide shared utilities and helper functions
│       ├── appError.ts            # Custom AppError class tailored for operational errors
│       ├── catchAsync.ts          # Express promise wrapper to bypass manual try-catch blocks
│       ├── sendMail.ts            # Nodemailer utility engine for dispatching application emails
│       └── sendResponse.ts        # Utility script to format uniform API JSON payloads
│
├── .env                           # Local system environment configurations and application secrets
├── eslint.config.js               # Code quality, formatting, and linting rules setup
├── package.json                   # Project lifecycle scripts and third-party dependency list
└── tsconfig.json                  # TypeScript compiler rules and path alias mappings