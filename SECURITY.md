# Security

## Reporting a vulnerability

Please don't open a public issue. Report it privately through GitHub's
[security advisories](https://github.com/Miguelvv7/barrio/security/advisories/new) for this
repository, or contact me through my [GitHub profile](https://github.com/Miguelvv7). I'll reply
within a few days.

The live demo at https://barrio-blush.vercel.app holds no real customer data: bookings made there are
never sent to the businesses. Please don't load-test it or try to fill its agendas.

## What's in place

The measures (atomic booking limits, per-phone and hourly caps, signed owner sessions, cancel
lockout, sandbox vs verified businesses, escaped output, body size limits, optional OAuth 2.1) are
described in [Reliability and security](README.md#reliability-and-security), each with its tests.
