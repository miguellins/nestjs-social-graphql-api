# Notifications Architecture

This module is the current reference implementation for notification persistence plus asynchronous delivery.

## Internal roles

- `notifications.service.ts`
  owns persisted notification writes, reads, unread counts, and read-state updates
- `notification-trigger.service.ts`
  translates feature events into notification creation calls
- `notification-delivery.service.ts`
  owns recipient-scoped realtime publish behavior
- `notification-outbox.handler.ts`
  handles durable delivery of already-persisted notifications from outbox events

## Standard pattern

For notification-producing flows, use this sequence:

1. validate and normalize input
2. persist the notification record
3. treat the database row as the source of truth
4. publish realtime delivery as follow-up work
5. if the feature needs durable delivery, enqueue an outbox event after persistence and let the worker own the publish step

Current durable event examples:

- `COMMENT_REPLIED`
  reply comments can persist the notification row and the outbox row in the same transaction
- `FOLLOW_REQUESTED`
  private follow requests can persist the follow request row, notification row, and outbox row in the same transaction

## What other modules should copy

- keep correctness-critical writes in the main feature transaction
- use trigger helpers instead of constructing notification payloads ad hoc in every module
- keep delivery concerns separate from persistence concerns
- use durable outbox processing when request-bound best-effort publish is no longer sufficient
- keep notification types semantically distinct; `FOLLOW_REQUESTED` is separate from `USER_FOLLOWED`
