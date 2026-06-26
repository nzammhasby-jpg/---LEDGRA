# Supabase Edge Function Secrets Required — ZATCA Sandbox / Simulation Integration

لتفعيل طبقة الاتصال الآمنة والخلفية لمحاكاة وإرسال فواتير الهيئة (ZATCA Sandbox/Simulation API Integration) لـ **LEDGRA | لِدجرا**، يجب تهيئة المتغيرات البيئية التالية داخل خوادم Supabase Edge Functions.

> 🔒 **تنبيه أمني هام**: لا تضع أي مفاتيح حقيقية داخل ملفات المشروع البرمجية. يتم جلب كافة المفاتيح وعناوين الروابط آلياً عبر الخزنة المشفرة لـ Supabase Secrets.

## الأوامر الإرشادية لتهيئة المتغيرات (CLI)

قم بتنفيذ الأوامر التالية عبر منفذ الأوامر الخاص بـ Supabase CLI لتسجيل روابط ومحددات البيئة:

```bash
# 1. ضبط روابط بوابة المطورين والمحاكاة لهيئة الزكاة والجمارك والضريبة (ZATCA)
supabase secrets set ZATCA_SANDBOX_BASE_URL="https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal"
supabase secrets set ZATCA_SIMULATION_BASE_URL="https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation"

# 2. تفعيل أو تعطيل النقل الفعلي لبنية XML إلى خوادم الهيئة التجريبية (Gating Flags)
# (القيمة الافتراضية 'false' لمنع أي محاولات إرسال غير مقصودة حتى اكتمال شروط الجاهزية والتوقيع)
supabase secrets set ZATCA_ENABLE_SANDBOX_SUBMIT="false"
supabase secrets set ZATCA_ENABLE_SIMULATION_SUBMIT="false"
```

## التوقيع الرقمي للمنشآت (Organization CSIDs / Secrets)

لجعل دالة الخادم آمنة ومعزولة تماماً (Isolated Secrets Design):
* **لا يتم حفظ كلمات المرور أو الشهادات المشفرة (Secrets / CSIDs) داخل جداول قاعدة البيانات نهائياً**.
* بدلاً من ذلك، نستخدم الاسم الرمزي للسر (Secret Reference Name) داخل حقل `zatca_signing_profiles.private_key_secret_reference` (مثال: `ZATCA_ORG_MY_COMPANY_COMPLIANCE_SECRET`).
* تقرأ دالة الخادم المعرف الرمزي، وتبحث عنه داخل خزنة الـ Secrets مباشرة عبر `Deno.env.get(...)`.

مثال لتهيئة سر منشأة مخصصة:
```bash
# تسجيل شهادة الامتثال لسر المنشأة ذات المعرف 'ORG123'
supabase secrets set ZATCA_ORG_ORG123_COMPLIANCE_SECRET="Compliance_Certificate_Secret_Value..."
```
