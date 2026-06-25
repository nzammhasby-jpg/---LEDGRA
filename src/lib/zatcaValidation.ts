export interface ZatcaSeller {
  seller_name: string;
  seller_vat_number: string;
  seller_commercial_registration: string;
  seller_address: string;
  seller_city: string;
  seller_postal_code: string;
  seller_country: string;
}

export interface ZatcaBuyer {
  customer_name: string | null;
  customer_vat_number: string | null;
  customer_commercial_registration: string | null;
  customer_address: string | null;
  customer_city: string | null;
}

export interface ZatcaInvoiceLine {
  id: string;
  itemName: string;
  quantity: number;
  priceBeforeTax: number;
  discountAmount: number;
  taxPercent: number; // e.g. 15 for 15%
  lineExtensionAmount: number;
  vatAmount: number;
  inclusiveAmount: number;
}

export interface ZatcaInvoiceTotals {
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
}

export interface ZatcaInvoiceDocument {
  invoiceNumber: string;
  uuid: string;
  issueDate: string; // YYYY-MM-DD
  issueTime: string; // HH:MM:SS
  invoiceType: 'simplified' | 'standard';
  status: string; // 'draft' | 'approved' | 'cancelled'
  seller: ZatcaSeller;
  buyer: ZatcaBuyer;
  lines: ZatcaInvoiceLine[];
  totals: ZatcaInvoiceTotals;
  currency: string;
}

export interface ZatcaXmlValidationError {
  field: string;
  code: string;
  message: string;
}

export interface ZatcaXmlValidationResult {
  isValid: boolean;
  errors: ZatcaXmlValidationError[];
}

export interface ZatcaXmlGenerationResult {
  success: boolean;
  xmlContent: string | null;
  xmlHash: string | null;
  errors: string[];
}

/**
 * Validates a structured ZatcaInvoiceDocument for ZATCA XML UBL 2.1 compliance before generation.
 */
export function validateZatcaInvoiceForXml(doc: ZatcaInvoiceDocument): ZatcaXmlValidationResult {
  const errors: ZatcaXmlValidationError[] = [];

  // --- Seller Validations ---
  if (!doc.seller.seller_name || doc.seller.seller_name.trim().length === 0) {
    errors.push({
      field: 'seller_name',
      code: 'MISSING_SELLER_NAME',
      message: 'اسم البائع اللفظي بالعربية مطلوب.'
    });
  }

  const vatTrim = (doc.seller.seller_vat_number || '').trim();
  if (!vatTrim) {
    errors.push({
      field: 'seller_vat_number',
      code: 'MISSING_SELLER_VAT',
      message: 'الرقم الضريبي للبائع مطلوب.'
    });
  } else {
    const isVatValid = /^[3]\d{13}[3]$/.test(vatTrim);
    if (!isVatValid) {
      errors.push({
        field: 'seller_vat_number',
        code: 'INVALID_SELLER_VAT',
        message: 'الرقم الضريبي للبائع يجب أن يكون 15 رقمًا ويبدأ بـ 3 وينتهي بـ 3.'
      });
    }
  }

  if (!doc.seller.seller_commercial_registration || doc.seller.seller_commercial_registration.trim().length === 0) {
    errors.push({
      field: 'seller_commercial_registration',
      code: 'MISSING_SELLER_CR',
      message: 'رقم السجل التجاري للبائع مطلوب.'
    });
  }

  if (!doc.seller.seller_address || doc.seller.seller_address.trim().length === 0) {
    errors.push({
      field: 'seller_address',
      code: 'MISSING_SELLER_ADDRESS',
      message: 'العنوان الجغرافي للبائع مطلوب.'
    });
  }

  if (!doc.seller.seller_city || doc.seller.seller_city.trim().length === 0) {
    errors.push({
      field: 'seller_city',
      code: 'MISSING_SELLER_CITY',
      message: 'اسم مدينة البائع مطلوب.'
    });
  }

  if (!doc.seller.seller_postal_code || doc.seller.seller_postal_code.trim().length === 0) {
    errors.push({
      field: 'seller_postal_code',
      code: 'MISSING_SELLER_POSTAL',
      message: 'الرمز البريدي للبائع مطلوب.'
    });
  }

  if (doc.seller.seller_country !== 'SA') {
    errors.push({
      field: 'seller_country',
      code: 'INVALID_SELLER_COUNTRY',
      message: 'رمز دولة البائع يجب أن يكون SA للمملكة العربية السعودية.'
    });
  }

  // --- Invoice Header Validations ---
  if (!doc.invoiceNumber || doc.invoiceNumber.trim().length === 0) {
    errors.push({
      field: 'invoiceNumber',
      code: 'MISSING_INVOICE_NUMBER',
      message: 'رقم الفاتورة مطلوب لتوليد المستند.'
    });
  }

  if (!doc.issueDate || doc.issueDate.trim().length === 0) {
    errors.push({
      field: 'issueDate',
      code: 'MISSING_ISSUE_DATE',
      message: 'تاريخ إصدار الفاتورة مطلوب.'
    });
  }

  if (!doc.issueTime || doc.issueTime.trim().length === 0) {
    errors.push({
      field: 'issueTime',
      code: 'MISSING_ISSUE_TIME',
      message: 'وقت إصدار الفاتورة مطلوب.'
    });
  }

  if (doc.currency !== 'SAR') {
    errors.push({
      field: 'currency',
      code: 'INVALID_CURRENCY',
      message: 'العملة يجب أن تكون بالريال السعودي SAR.'
    });
  }

  if (doc.status !== 'approved') {
    errors.push({
      field: 'status',
      code: 'INVOICE_NOT_APPROVED',
      message: 'لا يمكن توليد بيانات الفوترة الإلكترونية إلا للفواتير المعتمدة (Approved) فقط.'
    });
  }

  // --- Buyer Validations (based on invoice type) ---
  if (doc.invoiceType === 'standard') {
    if (!doc.buyer.customer_name || doc.buyer.customer_name.trim().length === 0) {
      errors.push({
        field: 'customer_name',
        code: 'STANDARD_BUYER_DATA_MISSING',
        message: 'الفاتورة الضريبية القياسية تتطلب تسجيل اسم العميل.'
      });
    }

    const buyerVat = (doc.buyer.customer_vat_number || '').trim();
    if (!buyerVat) {
      errors.push({
        field: 'customer_vat_number',
        code: 'STANDARD_BUYER_DATA_MISSING',
        message: 'الرقم الضريبي للعميل مطلوب للفاتورة الضريبية القياسية.'
      });
    } else {
      const isBuyerVatValid = /^[3]\d{13}[3]$/.test(buyerVat);
      if (!isBuyerVatValid) {
        errors.push({
          field: 'customer_vat_number',
          code: 'INVALID_BUYER_VAT',
          message: 'الرقم الضريبي للعميل يجب أن يكون 15 رقمًا ويبدأ بـ 3 وينتهي بـ 3.'
        });
      }
    }

    if (!doc.buyer.customer_address || doc.buyer.customer_address.trim().length === 0) {
      errors.push({
        field: 'customer_address',
        code: 'STANDARD_BUYER_DATA_MISSING',
        message: 'عنوان العميل مطلوب للفاتورة الضريبية القياسية.'
      });
    }

    if (!doc.buyer.customer_city || doc.buyer.customer_city.trim().length === 0) {
      errors.push({
        field: 'customer_city',
        code: 'STANDARD_BUYER_DATA_MISSING',
        message: 'مدينة العميل مطلوبة للفاتورة الضريبية القياسية.'
      });
    }
  }

  // --- Lines Validations ---
  if (!doc.lines || doc.lines.length === 0) {
    errors.push({
      field: 'lines',
      code: 'MISSING_LINES',
      message: 'الفاتورة يجب أن تحتوي على بند واحد على الأقل.'
    });
  } else {
    doc.lines.forEach((line, idx) => {
      const prefix = `البند ${idx + 1}: `;
      if (!line.itemName || line.itemName.trim().length === 0) {
        errors.push({
          field: `lines[${idx}].itemName`,
          code: 'MISSING_LINE_NAME',
          message: `${prefix}اسم البند مطلوب.`
        });
      }

      if (line.quantity <= 0) {
        errors.push({
          field: `lines[${idx}].quantity`,
          code: 'INVALID_LINE_QUANTITY',
          message: `${prefix}الكمية يجب أن تكون أكبر من الصفر.`
        });
      }

      if (line.priceBeforeTax < 0) {
        errors.push({
          field: `lines[${idx}].priceBeforeTax`,
          code: 'INVALID_LINE_PRICE',
          message: `${prefix}سعر الوحدة لا يمكن أن يكون سالبًا.`
        });
      }

      // Check subtotal math
      const expectedLineExt = Number((line.quantity * line.priceBeforeTax - line.discountAmount).toFixed(2));
      if (Math.abs(line.lineExtensionAmount - expectedLineExt) > 0.02) {
        errors.push({
          field: `lines[${idx}].lineExtensionAmount`,
          code: 'INVALID_LINE_MATH',
          message: `${prefix}القيمة الإجمالية للبند غير متطابقة مع العملية الحسابية.`
        });
      }

      // Check tax amount math
      const expectedTax = Number((expectedLineExt * (line.taxPercent / 100)).toFixed(2));
      if (Math.abs(line.vatAmount - expectedTax) > 0.02) {
        errors.push({
          field: `lines[${idx}].vatAmount`,
          code: 'INVALID_LINE_MATH',
          message: `${prefix}قيمة ضريبة البند غير متطابقة مع العملية الحسابية.`
        });
      }
    });
  }

  // --- Document Totals Validations ---
  if (doc.lines && doc.lines.length > 0) {
    let computedSubtotal = 0;
    let computedDiscountTotal = 0;
    let computedTaxTotal = 0;

    doc.lines.forEach(l => {
      computedSubtotal += l.lineExtensionAmount;
      computedDiscountTotal += l.discountAmount;
      computedTaxTotal += l.vatAmount;
    });

    computedSubtotal = Number(computedSubtotal.toFixed(2));
    computedDiscountTotal = Number(computedDiscountTotal.toFixed(2));
    computedTaxTotal = Number(computedTaxTotal.toFixed(2));
    const computedTotal = Number((computedSubtotal + computedTaxTotal).toFixed(2));

    // Tolerance check
    const tolerance = 0.05;

    if (Math.abs(doc.totals.subtotal - computedSubtotal) > tolerance) {
      errors.push({
        field: 'totals.subtotal',
        code: 'INVALID_TOTALS',
        message: `المجموع الفرعي المصرح به (${doc.totals.subtotal}) لا يطابق مجموع البنود الفعلي (${computedSubtotal}).`
      });
    }

    if (Math.abs(doc.totals.tax_total - computedTaxTotal) > tolerance) {
      errors.push({
        field: 'totals.tax_total',
        code: 'INVALID_TOTALS',
        message: `مجموع الضريبة المصرح به (${doc.totals.tax_total}) لا يطابق ضريبة البنود الفعلية (${computedTaxTotal}).`
      });
    }

    if (Math.abs(doc.totals.total - computedTotal) > tolerance) {
      errors.push({
        field: 'totals.total',
        code: 'INVALID_TOTALS',
        message: `الإجمالي النهائي المصرح به (${doc.totals.total}) لا يطابق الإجمالي الفعلي مع الضريبة (${computedTotal}).`
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
