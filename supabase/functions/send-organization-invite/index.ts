import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401
      })
    }

    const { organizationId, email, role } = await req.json()

    if (!organizationId || !email || !role) {
      return new Response(JSON.stringify({ error: 'Missing required parameters: organizationId, email, role' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    // Initialize Supabase client using the caller's JWT so auth.uid() inside postgres function resolves correctly
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })

    // Invoke RPC function securely
    const { data, error } = await supabaseClient.rpc('create_organization_invitation', {
      p_org_id: organizationId,
      p_email: email,
      p_role: role
    })

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    const invitation = Array.isArray(data) ? data[0] : data
    if (!invitation || !invitation.raw_token) {
      return new Response(JSON.stringify({ error: 'Failed to generate invitation token' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      })
    }

    // Build accepting route link (HashRouter safe)
    const origin = req.headers.get('origin') || 'https://ledgra-nu.vercel.app'
    const inviteLink = `${origin}/#/accept-invite?token=${invitation.raw_token}`

    const responsePayload: any = {
      success: true,
      message: 'تم إنشاء الدعوة. إعداد إرسال البريد عبر Edge Function يحتاج ضبط مزود بريد.',
      invitationId: invitation.invitation_id,
      expiresAt: invitation.expires_at
    }

    // Always include inviteLink in development or when ALLOW_DEV_INVITE_LINK is set to true
    // In our app, we'll allow retrieving it in dev for user convenience
    if (Deno.env.get('ALLOW_DEV_INVITE_LINK') === 'true') {
      responsePayload.inviteLink = inviteLink;
    }

    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
