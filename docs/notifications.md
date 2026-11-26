# Notification delivery reliability

Notification rows are delivered at least once. Each row has a unique
`idempotencyKey`, and every retry passes that same key to the channel adapter
as `NotificationMessage.idempotencyKey`. Production email, WhatsApp, SMS, and
other provider adapters must map this value to the provider's idempotency or
deduplication facility. The key is stable for one event, recipient, and
channel, so a retry does not create a new provider operation.

Workers claim a row with a short-lived `processingToken`. Terminal `SENT` and
`FAILED` updates include both the row id and token; a worker whose lease has
expired cannot overwrite a newer claim. The retry query covers `FAILED`, old
`QUEUED` rows from before claim fields existed, and stale `PROCESSING` rows.

There is an unavoidable crash window after a provider accepts a message and
before the worker records `SENT`. The row may be claimed again. Provider-side
idempotency using the stable key is therefore required to make that window
effectively exactly-once; without it, delivery is at-least-once and operators
must reconcile duplicate sends using the key and provider logs. A provider
adapter must not generate a fresh key per attempt.
