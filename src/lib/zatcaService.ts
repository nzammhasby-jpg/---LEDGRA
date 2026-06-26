import { supabase } from './supabase';
import { ZatcaSettings, EInvoiceArtifact, SalesInvoice } from '../types';
import { generateZatcaQrBase64 } from './zatcaQr';
import { generateInvoiceXml, calculateXmlHash } from './zatcaXml';
import { validateZatcaInvoiceForXml, ZatcaInvoiceDocument, ZatcaInvoiceLine } from './zatcaValidation';

function hasBasicXmlTagBalance(xml: string): boolean {
  return (
    xml.includes('<Invoice') &&
    xml.includes('</Invoice>') &&
    xml.includes('<cac:InvoiceLine>') &&
    xml.includes('</cac:InvoiceLine>') &&
    !xml.includes('undefined') &&
    !xml.includes('null') &&
    !xml.includes('<cbc:Percent>1500.00</cbc:Percent>')
  );
}

export const zatcaService = {
  /**
   * Fetches ZATCA Settings for a specific Organization.
   */
  async getZatcaSettings(orgId: string): Promise<ZatcaSettings | null> {
    const { data, error } = await supabase
      .from('zatca_settings')
      .select('*')
      .eq('organization_id', orgId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching ZATCA settings:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      throw error;
    }
    return data as ZatcaSettings | null;
  },

  /**
   * Updates/creates ZATCA settings for an organization (accessible by owner/admin).
   */
  async updateZatcaSettings(
    orgId: string,
    input: {
      is_enabled: boolean;
      seller_name: string;
      seller_vat_number: string;
      seller_commercial_registration: string;
      seller_address: string;
      seller_city: string;
      seller_postal_code: string;
      seller_country: string;
      invoice_type_default: 'simplified' | 'standard';
      environment: 'sandbox' | 'simulation' | 'production';
    }
  ): Promise<string> {
    const { data, error } = await supabase.rpc('upsert_zatca_settings', {
      p_org_id: orgId,
      p_is_enabled: input.is_enabled,
      p_seller_name: input.seller_name || null,
      p_seller_vat_number: input.seller_vat_number || null,
      p_seller_commercial_registration: input.seller_commercial_registration || null,
      p_seller_address: input.seller_address || null,
      p_seller_city: input.seller_city || null,
      p_seller_postal_code: input.seller_postal_code || null,
      p_seller_country: input.seller_country || 'SA',
      p_invoice_type_default: input.invoice_type_default,
      p_environment: input.environment
    });

    if (error) {
      console.error('Error updating ZATCA settings via RPC:', error);
      throw error;
    }
    return data as string;
  },

  /**
   * Fetches the generated electronic invoice artifact.
   */
  async getEInvoiceArtifact(invoiceId: string): Promise<EInvoiceArtifact | null> {
    const { data, error } = await supabase
      .from('e_invoice_artifacts')
      .select('*')
      .eq('sales_invoice_id', invoiceId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching E-Invoice artifact:', error);
      throw error;
    }
    return data as EInvoiceArtifact | null;
  },

  /**
   * Validates ZATCA configuration state and returns any issues/errors.
   */
  validateZatcaReadiness(settings: ZatcaSettings | null, invoice?: SalesInvoice | null): string[] {
    const errors: string[] = [];

    if (!settings) {
      errors.push('لم يتم تهيئة إعدادات الفوترة الإلكترونية للمنشأة بعد.');
      return errors;
    }

    if (!settings.is_enabled) {
      errors.push('الفوترة الإلكترونية معطلة في الإعدادات لهذه المنشأة.');
    }

    if (!settings.seller_name || settings.seller_name.trim().length === 0) {
      errors.push('اسم المنشأة/البائع بالعربية مطلوب.');
    }

    if (!settings.seller_vat_number || settings.seller_vat_number.trim().length !== 15) {
      errors.push('الرقم الضريبي للبائع مطلوب ويجب أن يتكون من 15 رقمًا.');
    } else if (!settings.seller_vat_number.startsWith('3')) {
      errors.push('الرقم الضريبي للبائع السعودي يجب أن يبدأ بالرقم 3.');
    }

    if (!settings.seller_commercial_registration || settings.seller_commercial_registration.trim().length === 0) {
      errors.push('رقم السجل التجاري مطلوب.');
    }

    if (!settings.seller_address || settings.seller_address.trim().length === 0) {
      errors.push('عنوان المنشأة (الشارع والمبنى) مطلوب.');
    }

    if (!settings.seller_city || settings.seller_city.trim().length === 0) {
      errors.push('اسم المدينة مطلوب.');
    }

    if (settings.seller_country !== 'SA') {
      errors.push('رمز الدولة يجب أن يكون SA للمملكة العربية السعودية.');
    }

    // Invoice-specific validations if passed
    if (invoice) {
      if (invoice.status !== 'approved') {
        errors.push('لا يمكن توليد بيانات الفوترة الضريبية للفواتير وهي في حالة مسودة أو ملغاة.');
      }

      // Check lines
      if (!invoice.lines || invoice.lines.length === 0) {
        errors.push('الفاتورة لا تحتوي على أي بنود محاسبية.');
      } else {
        // ZATCA tax rules
        const hasVat = invoice.lines.some(l => Number(l.tax_rate) > 0);
        if (!hasVat && Number(invoice.tax_total) === 0) {
          errors.push('تحذير: الفاتورة لا تحتوي على ضريبة القيمة المضافة. الفواتير الضريبية يجب أن تطبق الضريبة بنسبة 15% أو نسبة معفاة محددة.');
        }
      }

      // If standard tax invoice is requested, we strictly need customer details
      const invoiceType = settings.invoice_type_default || 'simplified';
      if (invoiceType === 'standard') {
        const customer = invoice.customer;
        if (!customer) {
          errors.push('الفاتورة الضريبية القياسية تتطلب اختيار عميل مسجل.');
        } else {
          if (!customer.tax_number || customer.tax_number.trim().length !== 15) {
            errors.push('للفاتورة الضريبية القياسية (Standard)، الرقم الضريبي للعميل مطلوب ويجب أن يتكون من 15 رقمًا.');
          }
          if (!customer.address || customer.address.trim().length === 0) {
            errors.push('عنوان العميل (الشارع) مطلوب للفاتورة الضريبية القياسية.');
          }
          if (!customer.city || customer.city.trim().length === 0) {
            errors.push('مدينة العميل مطلوبة للفاتورة الضريبية القياسية.');
          }
        }
      }
    }

    return errors;
  },

  /**
   * Generates and registers the e-invoice artifact (QR TLV and initial XML) in the database.
   */
  async generateAndSaveArtifact(
    orgId: string,
    invoice: SalesInvoice,
    settings: ZatcaSettings
  ): Promise<{ success: boolean; artifact: EInvoiceArtifact | null; errors: string[] }> {
    const invoiceType = settings.invoice_type_default || 'simplified';

    try {
      // 1. Build ZatcaInvoiceLine structures
      const docLines: ZatcaInvoiceLine[] = (invoice.lines || []).map((line, idx) => {
        const qty = Number(line.quantity) || 0;
        const price = Number(line.unit_price) || 0;
        const disc = Number(line.discount_amount) || 0;
        const taxPercent = Number(line.tax_rate) || 0;
        const lineExtensionAmount = Number((qty * price - disc).toFixed(2));
        const vatAmount = Number((lineExtensionAmount * (taxPercent / 100)).toFixed(2));
        const inclusiveAmount = Number((lineExtensionAmount + vatAmount).toFixed(2));

        return {
          id: line.id || String(idx + 1),
          itemName: line.description || 'صنف مبيعات',
          quantity: qty,
          priceBeforeTax: price,
          discountAmount: disc,
          taxPercent: taxPercent,
          lineExtensionAmount,
          vatAmount,
          inclusiveAmount
        };
      });

      // 2. Build ZatcaInvoiceDocument
      const doc: ZatcaInvoiceDocument = {
        invoiceNumber: invoice.invoice_number || '',
        uuid: invoice.id || '',
        issueDate: invoice.invoice_date || '',
        issueTime: invoice.approved_at 
          ? new Date(invoice.approved_at).toISOString().split('T')[1].substring(0, 8) 
          : '12:00:00',
        invoiceType: invoiceType,
        status: invoice.status || 'draft',
        seller: {
          seller_name: settings.seller_name || '',
          seller_vat_number: settings.seller_vat_number || '',
          seller_commercial_registration: settings.seller_commercial_registration || '',
          seller_address: settings.seller_address || '',
          seller_city: settings.seller_city || '',
          seller_postal_code: settings.seller_postal_code || '',
          seller_country: settings.seller_country || 'SA'
        },
        buyer: {
          customer_name: invoice.customer?.name || null,
          customer_vat_number: invoice.customer?.tax_number || null,
          customer_commercial_registration: invoice.customer?.commercial_registration || null,
          customer_address: invoice.customer?.address || null,
          customer_city: invoice.customer?.city || null
        },
        lines: docLines,
        totals: {
          subtotal: Number(invoice.subtotal) || 0,
          discount_total: Number(invoice.discount_total) || 0,
          tax_total: Number(invoice.tax_total) || 0,
          total: Number(invoice.total) || 0
        },
        currency: invoice.currency || 'SAR'
      };

      // 3. Perform pre-generation validation
      const validationResult = validateZatcaInvoiceForXml(doc);

      if (!validationResult.isValid) {
        const errors = validationResult.errors.map(e => e.message);
        try {
          await supabase.rpc('upsert_e_invoice_artifact', {
            p_org_id: orgId,
            p_invoice_id: invoice.id,
            p_invoice_number: invoice.invoice_number,
            p_invoice_type: invoiceType,
            p_qr_tlv_base64: null,
            p_xml_content: null,
            p_xml_hash: null,
            p_generation_status: 'invalid',
            p_validation_errors: errors
          });
        } catch (dbErr) {
          console.error('Error saving invalid artifact list:', dbErr);
        }

        const artifact = await this.getEInvoiceArtifact(invoice.id);
        return { success: false, artifact, errors };
      }

      // 4. Compile inputs for XML
      const xmlInput = {
        invoiceNumber: doc.invoiceNumber,
        uuid: doc.uuid,
        issueDate: doc.issueDate,
        issueTime: doc.issueTime,
        invoiceType: doc.invoiceType,
        sellerName: doc.seller.seller_name,
        sellerVatNumber: doc.seller.seller_vat_number,
        sellerCr: doc.seller.seller_commercial_registration || undefined,
        sellerAddress: doc.seller.seller_address || undefined,
        sellerCity: doc.seller.seller_city || undefined,
        sellerPostalCode: doc.seller.seller_postal_code || undefined,

        customerName: doc.buyer.customer_name || 'عميل نقدي',
        customerVatNumber: doc.buyer.customer_vat_number || undefined,
        customerCr: doc.buyer.customer_commercial_registration || undefined,
        customerAddress: doc.buyer.customer_address || undefined,
        customerCity: doc.buyer.customer_city || undefined,

        lines: docLines.map(l => ({
          id: l.id,
          itemName: l.itemName,
          quantity: l.quantity,
          priceBeforeTax: l.priceBeforeTax,
          discountAmount: l.discountAmount,
          taxPercent: l.taxPercent
        })),
        currency: doc.currency
      };

      // 5. Generate XML content and SHA256 hash representation
      const xmlContent = generateInvoiceXml(xmlInput);

      if (!hasBasicXmlTagBalance(xmlContent)) {
        const compileErrors = ['XML الناتج غير صالح للفحص الداخلي. راجع بنية الوسوم ونسب الضريبة.'];
        await supabase.rpc('upsert_e_invoice_artifact', {
          p_org_id: orgId,
          p_invoice_id: invoice.id,
          p_invoice_number: invoice.invoice_number,
          p_invoice_type: invoiceType,
          p_qr_tlv_base64: null,
          p_xml_content: null,
          p_xml_hash: null,
          p_generation_status: 'invalid',
          p_validation_errors: compileErrors
        });
        const artifact = await this.getEInvoiceArtifact(invoice.id);
        return { success: false, artifact, errors: compileErrors };
      }

      const xmlHash = await calculateXmlHash(xmlContent);

      // 6. Generate compliant QR Base64
      const isoTimestamp = `${doc.issueDate}T${doc.issueTime}Z`;
      const qrBase64 = generateZatcaQrBase64({
        sellerName: doc.seller.seller_name,
        vatNumber: doc.seller.seller_vat_number,
        timestamp: isoTimestamp,
        invoiceTotal: doc.totals.total,
        vatTotal: doc.totals.tax_total
      });

      // 7. Save outputs via dynamic upsert RPC
      const { error: rpcError } = await supabase.rpc('upsert_e_invoice_artifact', {
        p_org_id: orgId,
        p_invoice_id: invoice.id,
        p_invoice_number: invoice.invoice_number,
        p_invoice_type: invoiceType,
        p_qr_tlv_base64: qrBase64,
        p_xml_content: xmlContent,
        p_xml_hash: xmlHash,
        p_generation_status: 'xml_generated',
        p_validation_errors: []
      });

      if (rpcError) throw rpcError;

      const artifact = await this.getEInvoiceArtifact(invoice.id);
      return { success: true, artifact, errors: [] };

    } catch (e: any) {
      console.error('Error during ZATCA artifact compilation:', e);
      const compileErrors = [e.message || 'حدث خطأ غير متوقع أثناء توليد المستندات والترميز'];
      
      try {
        await supabase.rpc('upsert_e_invoice_artifact', {
          p_org_id: orgId,
          p_invoice_id: invoice.id,
          p_invoice_number: invoice.invoice_number,
          p_invoice_type: invoiceType,
          p_qr_tlv_base64: null,
          p_xml_content: null,
          p_xml_hash: null,
          p_generation_status: 'invalid',
          p_validation_errors: compileErrors
        });
      } catch (err) {
        console.error('Error fallback saving invalid artifacts:', err);
      }

      const artifact = await this.getEInvoiceArtifact(invoice.id);
      return { success: false, artifact, errors: compileErrors };
    }
  },

  async getEInvoiceArtifactWithSdkStatus(invoiceId: string): Promise<EInvoiceArtifact | null> {
    return this.getEInvoiceArtifact(invoiceId);
  },

  async markEInvoiceReadyForSdkCheck(artifactId: string): Promise<{ success: boolean; error?: string }> {
    return this.updateSdkValidationResult({
      artifactId,
      status: 'ready_for_check',
      errors: [],
      summary: 'المستند جاهز للفحص الخارجي باستخدام ZATCA SDK',
      toolVersion: null,
      rawResult: null
    });
  },

  async updateSdkValidationResult(input: {
    artifactId: string;
    status: 'ready_for_check' | 'passed' | 'failed' | 'needs_review';
    errors: any[];
    summary: string | null;
    toolVersion: string | null;
    rawResult: string | null;
  }): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase.rpc('update_e_invoice_sdk_validation', {
      p_artifact_id: input.artifactId,
      p_status: input.status,
      p_errors: input.errors,
      p_summary: input.summary,
      p_tool_version: input.toolVersion,
      p_raw_result: input.rawResult
    });

    if (error) {
      console.error('Error updating SDK validation result via RPC:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  },

  parseSdkValidationText(rawText: string): {
    status: 'passed' | 'failed' | 'needs_review';
    errors: Array<{ code?: string; message: string; severity?: string }>;
    summary: string;
  } {
    const textUpper = rawText.toUpperCase();
    
    let status: 'passed' | 'failed' | 'needs_review' = 'needs_review';
    if (textUpper.includes('PASS') || textUpper.includes('PASSED') || textUpper.includes('SUCCESS')) {
      status = 'passed';
    }
    if (textUpper.includes('ERROR') || textUpper.includes('FAILED') || textUpper.includes('FAIL')) {
      status = 'failed';
    }

    const lines = rawText.split('\n');
    const errors: Array<{ code?: string; message: string; severity?: string }> = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      const lineUpper = trimmed.toUpperCase();
      if (lineUpper.includes('ERROR') || lineUpper.includes('FAIL') || lineUpper.includes('INVALID') || lineUpper.includes('EXCEPTION')) {
        let code: string | undefined = undefined;
        const codeMatch = trimmed.match(/\[([A-Z0-9_-]+)\]/i);
        if (codeMatch) {
          code = codeMatch[1];
        }
        
        errors.push({
          code,
          message: trimmed,
          severity: 'error'
        });
      } else if (lineUpper.includes('WARN') || lineUpper.includes('WARNING')) {
        let code: string | undefined = undefined;
        const codeMatch = trimmed.match(/\[([A-Z0-9_-]+)\]/i);
        if (codeMatch) {
          code = codeMatch[1];
        }
        
        errors.push({
          code,
          message: trimmed,
          severity: 'warning'
        });
      }
    }

    const summary = status === 'passed' 
      ? 'اجتاز فحص التحقق من ZATCA SDK بنجاح.' 
      : status === 'failed' 
        ? `فشل الفحص. تم اكتشاف ${errors.length} أخطاء/تحذيرات.` 
        : 'يحتاج المستند إلى مراجعة يدوية إضافية.';

    return {
      status,
      errors,
      summary
    };
  },

  async getSdkValidationStats(orgId: string): Promise<Record<string, number>> {
    const { data, error } = await supabase
      .from('e_invoice_artifacts')
      .select('sdk_validation_status')
      .eq('organization_id', orgId);

    if (error) {
      console.error('Error fetching SDK stats:', error);
      return {
        passed: 0,
        failed: 0,
        needs_review: 0,
        ready_for_check: 0,
        not_checked: 0
      };
    }

    const counts: Record<string, number> = {
      passed: 0,
      failed: 0,
      needs_review: 0,
      ready_for_check: 0,
      not_checked: 0
    };

    (data || []).forEach((row: any) => {
      const status = row.sdk_validation_status || 'not_checked';
      if (status in counts) {
        counts[status]++;
      } else {
        counts.not_checked++;
      }
    });

    return counts;
  },

  /**
   * Tests connectivity to a sandbox or simulation environment via Edge Function.
   */
  async testConnectivity(
    orgId: string,
    environment: 'sandbox' | 'simulation'
  ): Promise<{ success: boolean; status: string; message: string; details?: any }> {
    const { data, error } = await supabase.functions.invoke('zatca-sandbox-integration', {
      body: {
        operation: 'connectivity_check',
        organizationId: orgId,
        environment
      }
    });

    if (error) {
      console.error('Error testing connectivity via Edge Function:', error);
      throw new Error(error.message || 'فشل الاتصال بدالة الربط التجريبية.');
    }

    return data;
  },

  /**
   * Triggers a simulated sandbox/simulation invoice transmission test via Edge Function.
   */
  async testInvoiceIntegration(
    orgId: string,
    invoiceId: string,
    artifactId: string,
    environment: 'sandbox' | 'simulation'
  ): Promise<{ success: boolean; status: string; message: string; details?: any }> {
    const { data, error } = await supabase.functions.invoke('zatca-sandbox-integration', {
      body: {
        operation: environment === 'sandbox' ? 'sandbox_invoice_test' : 'simulation_invoice_test',
        organizationId: orgId,
        invoiceId,
        artifactId,
        environment
      }
    });

    if (error) {
      console.error('Error testing invoice integration via Edge Function:', error);
      throw new Error(error.message || 'فشل اختبار إرسال الفاتورة التجريبية.');
    }

    return data;
  },

  /**
   * Fetches submission logs for an organization.
   */
  async getSubmissionLogs(orgId: string, limit = 50): Promise<any[]> {
    const { data, error } = await supabase
      .from('zatca_api_submissions')
      .select(`
        id,
        environment,
        operation,
        submission_status,
        http_status,
        zatca_status,
        error_message,
        created_at,
        created_by,
        sales_invoice_id,
        sales_invoices (
          invoice_number
        )
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching submission logs:', error);
      throw error;
    }

    return data || [];
  }
};
