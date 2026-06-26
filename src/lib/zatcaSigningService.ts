import { supabase } from './supabase';
import { ZatcaSigningProfile, ZatcaEnvironment, ZatcaProfileStatus, ZatcaPrivateKeyStorageMode } from '../types';

export const zatcaSigningService = {
  /**
   * Detects if the given text contains any Private Key patterns to prevent accidental leaks.
   */
  detectPrivateKeyLeak(text: string | null | undefined): boolean {
    if (!text) return false;
    const upperText = text.toUpperCase();
    return (
      upperText.includes('BEGIN PRIVATE KEY') ||
      upperText.includes('BEGIN RSA PRIVATE KEY') ||
      upperText.includes('BEGIN EC PRIVATE KEY') ||
      upperText.includes('PRIVATE KEY-----')
    );
  },

  /**
   * Validates the inputs for the ZATCA Signing Profile.
   */
  validateSigningProfileInput(input: Partial<ZatcaSigningProfile>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for private key leaks across all text fields
    const allTextFields = [
      input.csr_common_name,
      input.csr_serial_number,
      input.csr_organization_identifier,
      input.csr_organization_unit_name,
      input.csr_organization_name,
      input.csr_location,
      input.csr_industry,
      input.csr_pem,
      input.certificate_pem,
      input.csid_value,
      input.certificate_subject,
      input.certificate_issuer,
      input.private_key_secret_reference,
      input.notes
    ];

    for (const val of allTextFields) {
      if (val && this.detectPrivateKeyLeak(val)) {
        errors.push('لا يمكن حفظ المفتاح الخاص داخل الواجهة أو قاعدة البيانات. استخدم Secret Manager أو Edge Function Secrets في مرحلة التكامل اللاحقة.');
        return { valid: false, errors }; // Stop immediately if leak detected
      }
    }

    // CSR PEM validation
    if (input.csr_pem && input.csr_pem.trim().length > 0) {
      if (!input.csr_pem.includes('BEGIN CERTIFICATE REQUEST') || !input.csr_pem.includes('END CERTIFICATE REQUEST')) {
        errors.push('نص CSR PEM غير صالح. يجب أن يحتوي على BEGIN CERTIFICATE REQUEST و END CERTIFICATE REQUEST.');
      }
    }

    // Certificate PEM validation
    if (input.certificate_pem && input.certificate_pem.trim().length > 0) {
      if (!input.certificate_pem.includes('BEGIN CERTIFICATE') || !input.certificate_pem.includes('END CERTIFICATE')) {
        errors.push('نص Certificate PEM غير صالح. يجب أن يحتوي على BEGIN CERTIFICATE و END CERTIFICATE.');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  },

  /**
   * Fetches the ZATCA Signing Profile for an organization and environment.
   */
  async getZatcaSigningProfile(orgId: string, environment: ZatcaEnvironment): Promise<ZatcaSigningProfile | null> {
    const { data, error } = await supabase
      .from('zatca_signing_profiles')
      .select('*')
      .eq('organization_id', orgId)
      .eq('environment', environment)
      .maybeSingle();

    if (error) {
      console.error('Error fetching ZATCA signing profile:', error);
      throw error;
    }

    return data as ZatcaSigningProfile | null;
  },

  /**
   * Upserts the ZATCA Signing Profile using the secure secure RPC.
   */
  async upsertZatcaSigningProfile(input: {
    organization_id: string;
    environment: ZatcaEnvironment;
    profile_status: ZatcaProfileStatus;
    csr_common_name: string | null;
    csr_serial_number: string | null;
    csr_organization_identifier: string | null;
    csr_organization_unit_name: string | null;
    csr_organization_name: string | null;
    csr_country_name: string | null;
    csr_invoice_type: string | null;
    csr_location: string | null;
    csr_industry: string | null;
    csr_pem: string | null;
    certificate_pem: string | null;
    csid_value: string | null;
    csid_type: 'compliance' | 'production' | null;
    certificate_subject: string | null;
    certificate_issuer: string | null;
    certificate_valid_from: string | null;
    certificate_valid_to: string | null;
    private_key_storage_mode: ZatcaPrivateKeyStorageMode;
    private_key_secret_reference: string | null;
    notes: string | null;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    // 1. Client-side security verification
    const validation = this.validateSigningProfileInput(input);
    if (!validation.valid) {
      return { success: false, error: validation.errors[0] };
    }

    try {
      const { data, error } = await supabase.rpc('upsert_zatca_signing_profile', {
        p_org_id: input.organization_id,
        p_environment: input.environment,
        p_profile_status: input.profile_status,
        p_csr_common_name: input.csr_common_name,
        p_csr_serial_number: input.csr_serial_number,
        p_csr_organization_identifier: input.csr_organization_identifier,
        p_csr_organization_unit_name: input.csr_organization_unit_name,
        p_csr_organization_name: input.csr_organization_name,
        p_csr_country_name: input.csr_country_name || 'SA',
        p_csr_invoice_type: input.csr_invoice_type,
        p_csr_location: input.csr_location,
        p_csr_industry: input.csr_industry,
        p_csr_pem: input.csr_pem,
        p_certificate_pem: input.certificate_pem,
        p_csid_value: input.csid_value,
        p_csid_type: input.csid_type,
        p_certificate_subject: input.certificate_subject,
        p_certificate_issuer: input.certificate_issuer,
        p_certificate_valid_from: input.certificate_valid_from,
        p_certificate_valid_to: input.certificate_valid_to,
        p_private_key_storage_mode: input.private_key_storage_mode,
        p_private_key_secret_reference: input.private_key_secret_reference,
        p_notes: input.notes
      });

      if (error) {
        console.error('Error in upsert_zatca_signing_profile:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (err: unknown) {
      console.error('Exception in upsert_zatca_signing_profile:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء الحفظ.'
      };
    }
  },

  /**
   * Calculates readiness check list and overall compliance readiness state.
   */
  getSigningReadiness(
    profile: ZatcaSigningProfile | null,
    settings: any,
    invoicesStats: Record<string, number>
  ): {
    isReady: boolean;
    checks: { title: string; checked: boolean; type: 'info' | 'critical' }[];
  } {
    const checks: { title: string; checked: boolean; type: 'info' | 'critical' }[] = [];

    // 1. Seller Info / Organization Setup
    const sellerInfoOk = !!(
      settings?.seller_name &&
      settings?.seller_vat_number &&
      settings?.seller_address &&
      settings?.seller_city
    );
    checks.push({
      title: 'بيانات المنشأة والمالك مكتملة (الاسم، الرقم الضريبي، العنوان، المدينة)',
      checked: sellerInfoOk,
      type: 'critical'
    });

    // 2. Basic ZATCA settings configured
    const zatcaSettingsOk = !!(settings?.is_enabled);
    checks.push({
      title: 'إعدادات الفوترة الإلكترونية الأساسية مفعلة في المنشأة',
      checked: zatcaSettingsOk,
      type: 'critical'
    });

    // 3. CSR Metadata Completed
    const csrMetadataOk = !!(
      profile?.csr_common_name &&
      profile?.csr_serial_number &&
      profile?.csr_organization_identifier &&
      profile?.csr_organization_name
    );
    checks.push({
      title: 'بيانات الـ CSR الأساسية مكتملة (الاسم الشائع، الرقم التسلسلي، معرف المنشأة)',
      checked: csrMetadataOk,
      type: 'critical'
    });

    // 4. CSR PEM file generated or supplied
    const csrPemOk = !!(profile?.csr_pem && profile.csr_pem.includes('BEGIN CERTIFICATE REQUEST'));
    checks.push({
      title: 'ملف طلب التوقيع CSR PEM متاح أو تم إنشاؤه خارجياً',
      checked: csrPemOk,
      type: 'critical'
    });

    // 5. Private key is not stored as raw text (compliance guideline check)
    const privateKeyCheck =
      !profile ||
      profile.private_key_storage_mode === 'not_stored' ||
      (
        (
          profile.private_key_storage_mode === 'external_secret_manager' ||
          profile.private_key_storage_mode === 'edge_function_secret_reference'
        ) &&
        !!profile.private_key_secret_reference &&
        !this.detectPrivateKeyLeak(profile.private_key_secret_reference)
      );
    checks.push({
      title: 'مستوى تخزين المفتاح الخاص آمن وموثق (غير مخزن كنص خام)',
      checked: privateKeyCheck,
      type: 'critical'
    });

    // 6. Test e-invoice validation (at least one invoice passed XML validation / SDK validation)
    const sdkValidatedInvoiceOk = (invoicesStats?.passed || 0) > 0;
    checks.push({
      title: 'تم إجراء فحص XML / SDK على فاتورة تجريبية واحدة على الأقل واجتازت بنجاح',
      checked: sdkValidatedInvoiceOk,
      type: 'info'
    });

    // 7. CSID metadata provided
    const csidProvided = !!(profile?.csid_value && profile?.certificate_pem);
    checks.push({
      title: 'تم تسجيل شهادة التوقيع ومعرف CSID يدويًا من قبل المستخدم',
      checked: csidProvided,
      type: 'info'
    });

    // We require critical checks to be satisfied for base readiness
    const criticalsOk = checks
      .filter((c) => c.type === 'critical')
      .every((c) => c.checked);

    return {
      isReady: criticalsOk && csidProvided,
      checks
    };
  }
};
