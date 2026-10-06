# ADR-0001: Start as modular monolith

## Decision
Use one NestJS API deployment with strict bounded-context modules. PostgreSQL remains transactional source of truth. Extract services only when bottleneck/team ownership justifies it.

## Why
Faster development, simpler operations, easier transactions, while event/API boundaries preserve future extraction path.
