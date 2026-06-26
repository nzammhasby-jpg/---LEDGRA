# Supabase Edge Function Secrets Required

To fully configure the ZATCA Sandbox / Simulation API Integration on your Supabase project, execute the following commands using the Supabase CLI to provision the required server-side secrets.

> [!WARNING]
> Never expose these secrets to the frontend, browser logs, or git repositories.

```bash
# 1. Base URLs for ZATCA Simulation & Sandbox Developer Portals
supabase secrets set ZATCA_SANDBOX_BASE_URL="https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal"
supabase secrets set ZATCA_SIMULATION_BASE_URL="https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation"

# 2. Safety submission toggles (Set to false by default)
supabase secrets set ZATCA_ENABLE_SANDBOX_SUBMIT="false"
supabase secrets set ZATCA_ENABLE_SIMULATION_SUBMIT="false"
```

These environment variables are securely stored in Supabase's encrypted vaults and are only accessible server-side inside the Deno runtime environment of the Edge Function.
