# Testing

Use frontend tests for anything verifiable in the browser alone; use mc-tests for anything that requires a live Minecraft server. Add a test for every UI change and every bug fix.

## Frontend Tests

- **Run**: `cd web && npm run test:e2e`
- **Test code**: `web/tests/`

## Java Tests (mc-tests)

- **Run**: `cd mc-tests && npm run test`
- **Test code**: `mc-tests/tests/`

## Test Console (Manual Testing)

Browser-based console for manual testing. Requires Minecraft server running.

```powershell
cd mc-tests && npm run dev:console
# → http://localhost:7890/test-console
```
