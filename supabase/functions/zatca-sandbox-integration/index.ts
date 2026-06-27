// Supabase Edge Function: zatca-sandbox-integration
// Path: supabase/functions/zatca-sandbox-integration/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Type-safe sanitization helper to remove secrets and prevent saving full XMLs
function sanitizeForLog(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    // Truncate very long string values to avoid blowing up DB sizes, ensuring XMLs or big payloads are blocked or truncated
    if (value.length > 2000) {
      return value.substring(0, 2000) + "... [truncated]";
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(item => sanitizeForLog(item));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes("authorization") ||
        lowerKey.includes("token") ||
        lowerKey.includes("secret") ||
        lowerKey.includes("password") ||
        lowerKey.includes("private") ||
        lowerKey.includes("privatekey") ||
        lowerKey.includes("certificatesecret") ||
        lowerKey.includes("csidsecret")
      ) {
        sanitized[key] = "[REDACTED_SECRET]";
      } else {
        sanitized[key] = sanitizeForLog(obj[key]);
      }
    }
    return sanitized;
  }
  return value;
}

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

    // Strict validation of environment and operation prior to database reads
    const allowedEnvironments = ['sandbox', 'simulation'];
    const allowedOperations = ['connectivity_check', 'compliance_check', 'sandbox_invoice_test', 'simulation_invoice_test'];

    if (!allowedEnvironments.includes(environment)) {
      return new Response(
        JSON.stringify({ error: "البيئة المحددة غير صالحة." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!allowedOperations.includes(operation)) {
      return new Response(
        JSON.stringify({ error: "العملية المطلوبة غير صالحة." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (operation === 'sandbox_invoice_test' && environment !== 'sandbox') {
      return new Response(
        JSON.stringify({ error: "عملية فحص Sandbox تتطلب بيئة sandbox فقط." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (operation === 'simulation_invoice_test' && environment !== 'simulation') {
      return new Response(
        JSON.stringify({ error: "عملية فحص Simulation تتطلب بيئة simulation فقط." }),
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

    // Helper to log in DB securely (using service role client directly)
    const logSubmission = async (
      status: string,
      httpStatus: number | null,
      errorMessage: string | null,
      extra: {
        signingProfileId?: string | null;
        requestUuid?: string | null;
        xmlHash?: string | null;
        payloadSummary?: Record<string, unknown> | null;
        zatcaStatus?: string | null;
        zatcaRequestId?: string | null;
        responsePayload?: unknown;
        warnings?: unknown;
        errors?: unknown;
      } = {}
    ) => {
      try {
        const { error: dbError } = await supabase
          .from('zatca_api_submissions')
          .insert({
            organization_id: organizationId,
            sales_invoice_id: invoiceId ?? null,
            artifact_id: artifactId ?? null,
            signing_profile_id: extra.signingProfileId ?? null,
            environment,
            operation,
            submission_status: status,
            request_uuid: extra.requestUuid ?? null,
            request_xml_hash: extra.xmlHash ?? null,
            request_payload_summary: sanitizeForLog(extra.payloadSummary) ?? {},
            http_status: httpStatus ?? null,
            zatca_status: extra.zatcaStatus ?? null,
            zatca_request_id: extra.zatcaRequestId ?? null,
            zatca_response_payload: sanitizeForLog(extra.responsePayload) ?? null,
            zatca_warnings: sanitizeForLog(extra.warnings) ?? [],
            zatca_errors: sanitizeForLog(extra.errors) ?? [],
            error_message: errorMessage ?? null,
            created_by: user.id,
            submitted_at: ['submitted', 'accepted', 'rejected'].includes(status)
              ? new Date().toISOString()
              : null
          });

        if (dbError) {
          console.error("Failed to insert submission log via service role directly.");
          return { success: false, warning: "تم تنفيذ الفحص، لكن تعذر حفظ سجل المحاولة. راجع Edge Function logs." };
        }
        return { success: true };
      } catch (err) {
        console.error("Exception when saving submission log.");
        return { success: false, warning: "تم تنفيذ الفحص، لكن تعذر حفظ سجل المحاولة. راجع Edge Function logs." };
      }
    };

    // 5. Process Operations
    if (operation === 'connectivity_check') {
      const isConfigured = !!baseUrl;
      const status = isConfigured ? 'ready' : 'blocked';
      const msg = isConfigured
        ? `بيئة الاتصال التجريبية (${environment}) مهيأة وجاهزة للفحص.`
        : `بيئة الاتصال التجريبية (${environment}) غير مهيأة. يرجى ضبط المتغيرات البيئية أولاً.`;

      const logResult = await logSubmission(status, null, msg);

      return new Response(
        JSON.stringify({
          success: isConfigured,
          status,
          message: msg,
          warning: logResult?.success ? undefined : logResult?.warning,
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

      // Manual Isolation & Security validations (Do not rely on RLS in Service Role context)
      if (invoice.organization_id !== organizationId) {
        return new Response(
          JSON.stringify({ error: "غير مصرح: الفاتورة المحددة لا تنتمي لهذه المنشأة." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (artifact.organization_id !== organizationId || artifact.sales_invoice_id !== invoiceId) {
        return new Response(
          JSON.stringify({ error: "غير مصرح: مستند الفاتورة غير متطابق مع المنشأة أو الفاتورة المحددة." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (profile && profile.organization_id !== organizationId) {
        return new Response(
          JSON.stringify({ error: "غير مصرح: ملف التوقيع التعريفي لا ينتمي لهذه المنشأة." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate Readiness Checklist
      if (invoice.status !== 'approved') {
        const msg = "حالة الفاتورة ليست معتمدة (Approved). لا يمكن إرسال الفواتير المسودة.";
        const logResult = await logSubmission('blocked', null, msg, { signingProfileId });
        return new Response(JSON.stringify({ success: false, status: 'blocked', message: msg, warning: logResult?.success ? undefined : logResult?.warning }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (!artifact.xml_content || artifact.generation_status === 'invalid') {
        const msg = "ملف XML الخاص بالفاتورة غير صالح أو لم يتم توليده بنجاح بعد.";
        const logResult = await logSubmission('blocked', null, msg, { signingProfileId });
        return new Response(JSON.stringify({ success: false, status: 'blocked', message: msg, warning: logResult?.success ? undefined : logResult?.warning }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Check XML for invalid tags (undefined, null, NaN)
      if (artifact.xml_content.includes('undefined') || artifact.xml_content.includes('null') || artifact.xml_content.includes('NaN')) {
        const msg = "يحتوي ملف XML على قيم غير صالحة مثل undefined أو null أو NaN.";
        const logResult = await logSubmission('blocked', null, msg, { signingProfileId });
        return new Response(JSON.stringify({ success: false, status: 'blocked', message: msg, warning: logResult?.success ? undefined : logResult?.warning }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (artifact.sdk_validation_status !== 'passed' && artifact.sdk_validation_status !== 'needs_review') {
        const msg = "يجب فحص المستند أولاً باستخدام ZATCA SDK والتأكد من اجتيازه للفحص قبل الإرسال.";
        const logResult = await logSubmission('blocked', null, msg, { signingProfileId });
        return new Response(JSON.stringify({ success: false, status: 'blocked', message: msg, warning: logResult?.success ? undefined : logResult?.warning }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Check profile_status (and not profile.status)
      if (!profile || !['csid_added', 'ready_for_integration'].includes(profile.profile_status)) {
        const msg = "الملف التعريفي للتوقيع غير جاهز للبيئة المحددة. يرجى تهيئة الملف وإضافة CSID أولاً.";
        const logResult = await logSubmission('blocked', null, msg, { signingProfileId });
        return new Response(JSON.stringify({ success: false, status: 'blocked', message: msg, warning: logResult?.success ? undefined : logResult?.warning }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // STRICT RULE Check: ZATCA simulation/sandbox requiring a signed XML
      // Since actual signing flow is not built yet, simulation/sandbox invoice sending must be blocked and stated clearly
      const msgNoSigning = "لا يمكن إرسال XML إلى بيئة المحاكاة قبل اكتمال متطلبات التوقيع والتشفير. هذه المرحلة جهزت طبقة الاتصال فقط.";
      const logResult = await logSubmission('blocked', null, msgNoSigning, {
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
          warning: logResult?.success ? undefined : logResult?.warning,
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
    console.error("Unhandled Edge Function Exception.");
    return new Response(
      JSON.stringify({ error: error.message || "حدث خطأ داخلي في الخادم." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
