// Supabase Edge Function: zatca-sandbox-integration
// Path: supabase/functions/zatca-sandbox-integration/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  // Handle CORS pre-flight OPTIONS request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({ error: "تكوين الخادم غير مكتمل: مفاتيح بيئة العمل مفقودة." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase Client with Service Role Key
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 1. Get auth JWT token from headers
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: "غير مصرح: يجب توفير رمز الوصول." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "غير مصرح: رمز الوصول غير صالح أو منتهي الصلاحية." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Parse request body
    const body = await req.json();
    const { operation, organizationId, invoiceId, artifactId, environment } = body;

    if (!operation || !organizationId || !environment) {
      return new Response(
        JSON.stringify({ error: "معاملات الطلب غير مكتملة." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (environment === 'production') {
      return new Response(
        JSON.stringify({ error: "أمنياً: بيئة الإنتاج غير مسموح بها في هذه المرحلة." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Verify user's organization membership and role (owner, admin, accountant only)
    const { data: member, error: memberError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('profile_id', user.id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (memberError || !member) {
      return new Response(
        JSON.stringify({ error: "غير مصرح: لست عضواً في هذه المنشأة." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userRole = member.role;
    if (userRole !== 'owner' && userRole !== 'admin' && userRole !== 'accountant') {
      return new Response(
        JSON.stringify({ error: "غير مصرح: هذه العملية تتطلب صلاحية المالك، المدير، أو المحاسب." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Resolve Environment & Submit Flags
    const enableSandboxSubmit = Deno.env.get("ZATCA_ENABLE_SANDBOX_SUBMIT") === "true";
    const enableSimulationSubmit = Deno.env.get("ZATCA_ENABLE_SIMULATION_SUBMIT") === "true";
    const sandboxBaseUrl = Deno.env.get("ZATCA_SANDBOX_BASE_URL") || "";
    const simulationBaseUrl = Deno.env.get("ZATCA_SIMULATION_BASE_URL") || "";

    const submitFlag = environment === 'sandbox' ? enableSandboxSubmit : enableSimulationSubmit;
    const baseUrl = environment === 'sandbox' ? sandboxBaseUrl : simulationBaseUrl;

    // Helper to log in DB securely (using security definer RPC context as authenticated caller)
    // To call the RPC as the authenticated user, we can temporarily set the authorization header or just use RPC
    const logSubmission = async (status: string, httpStatus: number | null, errMsg: string | null, extra: any = {}) => {
      try {
        const { data, error } = await supabase.rpc('create_zatca_api_submission_log', {
          p_org_id: organizationId,
          p_sales_invoice_id: invoiceId || null,
          p_artifact_id: artifactId || null,
          p_signing_profile_id: extra.signingProfileId || null,
          p_environment: environment,
          p_operation: operation,
          p_submission_status: status,
          p_request_uuid: extra.requestUuid || null,
          p_request_xml_hash: extra.xmlHash || null,
          p_request_payload_summary: extra.payloadSummary ? JSON.stringify(extra.payloadSummary) : '{}',
          p_http_status: httpStatus,
          p_zatca_status: extra.zatcaStatus || null,
          p_zatca_request_id: extra.zatcaRequestId || null,
          p_zatca_response_payload: extra.responsePayload ? JSON.stringify(extra.responsePayload) : null,
          p_zatca_warnings: extra.warnings ? JSON.stringify(extra.warnings) : '[]',
          p_zatca_errors: extra.errors ? JSON.stringify(extra.errors) : '[]',
          p_error_message: errMsg
        });
        if (error) {
          console.error("Failed to write submission log via RPC:", error);
        }
        return data;
      } catch (err) {
        console.error("Exception logging submission:", err);
      }
    };

    // 5. Process Operations
    if (operation === 'connectivity_check') {
      const isConfigured = !!baseUrl;
      const status = isConfigured ? 'ready' : 'blocked';
      const msg = isConfigured
        ? `بيئة الاتصال التجريبية (${environment}) مهيأة وجاهزة للفحص.`
        : `بيئة الاتصال التجريبية (${environment}) غير مهيأة. يرجى ضبط المتغيرات البيئية أولاً.`;

      await logSubmission(status, null, msg);

      return new Response(
        JSON.stringify({
          success: isConfigured,
          status,
          message: msg,
          details: {
            environment,
            submitFlag,
            isBaseUrlConfigured: isConfigured
          }
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Invoice tests: compliance_check, sandbox_invoice_test, simulation_invoice_test
    if (operation === 'compliance_check' || operation === 'sandbox_invoice_test' || operation === 'simulation_invoice_test') {
      if (!invoiceId || !artifactId) {
        return new Response(
          JSON.stringify({ error: "معرف الفاتورة أو المستند مفقود." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Load invoice and artifact
      const { data: invoice, error: invError } = await supabase
        .from('sales_invoices')
        .select('*')
        .eq('id', invoiceId)
        .maybeSingle();

      const { data: artifact, error: artError } = await supabase
        .from('e_invoice_artifacts')
        .select('*')
        .eq('id', artifactId)
        .maybeSingle();

      if (invError || !invoice) {
        return new Response(
          JSON.stringify({ error: "لم يتم العثور على الفاتورة المطلوبة." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (artError || !artifact) {
        return new Response(
          JSON.stringify({ error: "لم يتم العثور على مستند الفاتورة الإلكترونية المولد." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Load signing profile
      const { data: profile, error: profError } = await supabase
        .from('zatca_signing_profiles')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('environment', environment)
        .maybeSingle();

      const signingProfileId = profile?.id || null;

      // Validate Readiness Checklist
      if (invoice.status !== 'approved') {
        const msg = "حالة الفاتورة ليست معتمدة (Approved). لا يمكن إرسال الفواتير المسودة.";
        await logSubmission('blocked', null, msg, { signingProfileId });
        return new Response(JSON.stringify({ success: false, status: 'blocked', message: msg }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (!artifact.xml_content || artifact.generation_status === 'invalid') {
        const msg = "ملف XML الخاص بالفاتورة غير صالح أو لم يتم توليده بنجاح بعد.";
        await logSubmission('blocked', null, msg, { signingProfileId });
        return new Response(JSON.stringify({ success: false, status: 'blocked', message: msg }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Check XML for invalid tags (undefined, null, NaN)
      if (artifact.xml_content.includes('undefined') || artifact.xml_content.includes('null') || artifact.xml_content.includes('NaN')) {
        const msg = "يحتوي ملف XML على قيم غير صالحة مثل undefined أو null أو NaN.";
        await logSubmission('blocked', null, msg, { signingProfileId });
        return new Response(JSON.stringify({ success: false, status: 'blocked', message: msg }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (artifact.sdk_validation_status !== 'passed' && artifact.sdk_validation_status !== 'needs_review') {
        const msg = "يجب فحص المستند أولاً باستخدام ZATCA SDK والتأكد من اجتيازه للفحص قبل الإرسال.";
        await logSubmission('blocked', null, msg, { signingProfileId });
        return new Response(JSON.stringify({ success: false, status: 'blocked', message: msg }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (!profile || (profile.status !== 'csid_added' && profile.status !== 'ready_for_integration')) {
        const msg = "الملف التعريفي للتوقيع غير جاهز للبيئة المحددة. يرجى تهيئة الملف وإضافة CSID أولاً.";
        await logSubmission('blocked', null, msg, { signingProfileId });
        return new Response(JSON.stringify({ success: false, status: 'blocked', message: msg }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // STRICT RULE Check: ZATCA simulation requiring a signed XML
      // Since we do not have signing flow fully built, we must block simulated transmission and state clearly
      const msgNoSigning = "لا يمكن إرسال XML إلى بيئة المحاكاة قبل اكتمال متطلبات التوقيع والتشفير. هذه المرحلة جهزت طبقة الاتصال فقط.";
      await logSubmission('blocked', null, msgNoSigning, {
        signingProfileId,
        xmlHash: artifact.xml_hash,
        payloadSummary: {
          invoice_number: invoice.invoice_number,
          invoice_type: artifact.invoice_type,
          issue_date: invoice.invoice_date,
          totals: {
            subtotal: invoice.subtotal,
            tax_total: invoice.tax_total,
            total: invoice.total
          }
        }
      });

      return new Response(
        JSON.stringify({
          success: false,
          status: 'blocked',
          message: msgNoSigning,
          details: {
            environment,
            submitFlag,
            requiresSigning: true
          }
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "العملية المطلوبة غير مدعومة." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Unhandled Edge Function Exception:", error);
    return new Response(
      JSON.stringify({ error: error.message || "حدث خطأ داخلي في الخادم." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
