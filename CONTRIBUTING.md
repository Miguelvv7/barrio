# Contributing to Barrio

Thanks for helping small businesses get on Alexa+!

```bash
npm install
npm run dev          # http://localhost:3000, in-memory demo data
npm test             # unit + MCP protocol tests
npm run typecheck && npm run lint
```

- The MCP App (Echo Show card) lives in `src/mcp-app/`; run `npm run build:app` after editing it and commit the regenerated `src/lib/mcp/app-html.generated.ts`.
- Database changes go in `supabase/migrations/` and must keep `npm run test:sql` green (needs a disposable Postgres in `DATABASE_URL`).
- Booking rules live in `src/lib/availability.ts` and `src/lib/booking-service.ts` — please add a test with every change.
- Never add code that guesses allergens or dietary information.
