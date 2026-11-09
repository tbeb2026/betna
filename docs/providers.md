# Production provider configuration

Betna keeps provider calls behind adapters. Development and unit tests use the
safe `log`/fake adapters; production refuses to boot with those adapters.

Set these variables in the API runtime:

```dotenv
NODE_ENV=production
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
EMAIL_FROM=Betna <noreply@example.com>
WHATSAPP_PROVIDER=meta
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_API_VERSION=v21.0
MEDIA_STORAGE_PROVIDER=s3
S3_ENDPOINT=https://s3.example.com
S3_REGION=af-south-1
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_PUBLIC_BUCKET=betna-public
S3_PRIVATE_BUCKET=betna-private
```

`MEDIA_STORAGE_PROVIDER=minio` uses the same S3-compatible adapter with
path-style URLs. Listing media and private inspection evidence select their
configured bucket from the `public/` and `private/` key prefixes. The adapter
issues AWS Signature V4 presigned upload/read URLs and fetches objects through
the configured endpoint.

The Next.js portal stores the opaque session in an HttpOnly cookie. Client
components call `/api/bff/*`; the server-only BFF reads that cookie and adds
the API Authorization header, so raw bearer tokens never enter browser props,
local storage, or client JavaScript.
