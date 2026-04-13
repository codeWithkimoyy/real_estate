# API Contract Smoke Tests

Run from project root:

```bash
php tests/api/contract_smoke.php
```

Environment variables:
- `API_BASE_URL` (default: `http://localhost/Activities/real_estate/api`)
- `API_BEARER_TOKEN` (optional, required for authenticated endpoint checks)

What this validates:
- Standard JSON envelope keys (`success`, `ok`, `requestId`)
- Error envelope shape (`error.code`, `error.message`)
- Auth-protected endpoint behavior when token is missing
- Optional authenticated endpoint contract when token is provided
