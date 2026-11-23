# Test plan and results

Local validation after the Supabase integration changes:

| Test | Result |
|---|---|
| Backend HTTP/provider tests (`npm test`) | 19 passed |
| Production frontend bundle (`npm run build`) | Passed |
| Dependency audit (`npm audit`) | 0 vulnerabilities |
| Postman collection JSON parse | Passed |
| Vite storefront smoke test without client credentials | App starts; labeled browse-only catalog renders |

Run these commands from the repository root:

```powershell
npm test
npm run build
npm audit
```

The local tests do not connect to the user's Supabase project or Maya. Apply the migration, configure the newly rotated backend service-role key, then verify Supabase Auth signup/sign-in, RLS access for customer/admin accounts, cart and quote RPCs, concurrent one-of-a-kind checkout, reservation release/expiry, and Maya Sandbox webhook/reconciliation. Those remote integration scenarios have not been run from this workspace.
