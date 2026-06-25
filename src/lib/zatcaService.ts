import { supabase } from './supabase';
import { ZatcaSettings, EInvoiceArtifact, SalesInvoice } from '../types';
import { generateZatcaQrBase64 } from './zatcaQr';
import { generateInvoiceXml, calculateXmlHash } from './zatcaXml';

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
    const errors = this.validateZatcaReadiness(settings, invoice);

    const invoiceType = settings.invoice_type_default || 'simplified';

    if (errors.length > 0) {
      // Save artifact as invalid so the system reflects readiness issues
      try {
        const { data: artId, error: rpcError } = await supabase.rpc('upsert_e_invoice_artifact', {
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

        if (rpcError) throw rpcError;

        const artifact = await this.getEInvoiceArtifact(invoice.id);
        return { success: false, artifact, errors };
      } catch (e) {
        console.error('Error saving invalid ZATCA validation artifact:', e);
        return { success: false, artifact: null, errors: [...errors, 'فشل حفظ سجل الأخطاء في قاعدة البيانات'] };
      }
    }

    try {
      // 1. Compile lines
      const xmlLines = (invoice.lines || []).map(line => ({
        id: line.id,
        itemName: line.description || 'صنف مبيعات',
        quantity: Number(line.quantity),
        priceBeforeTax: Number(line.unit_price),
        discountAmount: Number(line.discount_amount),
        taxPercent: Number(line.tax_rate) * 100 // convert e.g. 0.15 to 15
      }));

      // Find customer fields
      const customer = invoice.customer;

      // 2. Compile XML Input
      const xmlInput = {
        invoiceNumber: invoice.invoice_number,
        uuid: invoice.id, // using invoice.id as unique uuid
        issueDate: invoice.invoice_date, // YYYY-MM-DD
        issueTime: invoice.approved_at ? new Date(invoice.approved_at).toISOString().split('T')[1].substring(0, 8) : '12:00:00',
        invoiceType: invoiceType,
        sellerName: settings.seller_name || '',
        sellerVatNumber: settings.seller_vat_number || '',
        sellerCr: settings.seller_commercial_registration || undefined,
        sellerAddress: settings.seller_address || undefined,
        sellerCity: settings.seller_city || undefined,
        sellerPostalCode: settings.seller_postal_code || undefined,

        customerName: customer?.name || 'عميل نقدي',
        customerVatNumber: customer?.tax_number || undefined,
        customerCr: customer?.commercial_registration || undefined,
        customerAddress: customer?.address || undefined,
        customerCity: customer?.city || undefined,

        lines: xmlLines,
        currency: invoice.currency || 'SAR'
      };

      // 3. Compile local XML content
      const xmlContent = generateInvoiceXml(xmlInput);
      const xmlHash = await calculateXmlHash(xmlContent);

      // 4. Compile QR inputs
      // For ZATCA Base64 compliance:
      // Timestamp ISO structure: e.g. YYYY-MM-DDTHH:mm:ss
      const isoTimestamp = `${invoice.invoice_date}T${xmlInput.issueTime}Z`;

      const qrBase64 = generateZatcaQrBase64({
        sellerName: settings.seller_name || '',
        vatNumber: settings.seller_vat_number || '',
        timestamp: isoTimestamp,
        invoiceTotal: Number(invoice.total),
        vatTotal: Number(invoice.tax_total)
      });

      // 5. Save the compiled outputs via dynamic SEC DEF RPC
      const { data: artId, error: rpcError } = await supabase.rpc('upsert_e_invoice_artifact', {
        p_org_id: orgId,
        p_invoice_id: invoice.id,
        p_invoice_number: invoice.invoice_number,
        p_invoice_type: invoiceType,
        p_qr_tlv_base64: qrBase64,
        p_xml_content: xmlContent,
        p_xml_hash: xmlHash,
        p_generation_status: 'xml_generated', // successfully compiled both qr & xml
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
  }
};
