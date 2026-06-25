/**
 * Settle standard XML Generator following UBL 2.1 compliance structures for Saudi Arabia ZATCA e-invoicing.
 */

export interface ZatcaInvoiceXmlLine {
  id: string;
  itemName: string;
  quantity: number;
  priceBeforeTax: number;
  discountAmount?: number;
  taxPercent: number; // e.g. 15 for 15%
}

export interface ZatcaInvoiceXmlInput {
  invoiceNumber: string;
  uuid: string;
  issueDate: string; // YYYY-MM-DD
  issueTime: string; // HH:MM:SS
  invoiceType: 'simplified' | 'standard';
  sellerName: string;
  sellerVatNumber: string;
  sellerCr?: string;
  sellerAddress?: string;
  sellerCity?: string;
  sellerPostalCode?: string;

  customerName?: string;
  customerVatNumber?: string;
  customerCr?: string;
  customerAddress?: string;
  customerCity?: string;

  lines: ZatcaInvoiceXmlLine[];
  currency?: string; // default 'SAR'
}

/**
 * Escapes special characters to ensure valid XML and prevents null/undefined text leaks.
 */
export function escapeXml(unsafe: string | null | undefined): string {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Safe number formatter to prevent NaN or undefined leaks in XML tags.
 */
function safeFormatNum(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) {
    return '0.00';
  }
  return val.toFixed(2);
}

/**
 * Generates an initial UBL 2.1 e-invoice XML string.
 * This sets up the structures required for Saudi Arabia ZATCA Electronic Invoicing.
 */
export function generateInvoiceXml(input: ZatcaInvoiceXmlInput): string {
  const currency = escapeXml(input.currency || 'SAR');
  const invoiceCode = input.invoiceType === 'simplified' ? '0100000' : '0200000'; // Simplified or Standard subtype profile

  // Math totals calculation with robust fallbacks
  let totalLineExtensionAmount = 0; // Sum of line extensions (qty * price - discount)
  let totalVatAmount = 0;           // Total VAT amount
  let totalDiscountAmount = 0;      // Sum of discounts

  // Process lines and calculate taxes safely
  const processedLines = (input.lines || []).map((line, idx) => {
    const qty = Math.max(0, Number(line.quantity) || 0);
    const price = Math.max(0, Number(line.priceBeforeTax) || 0);
    const disc = Math.max(0, Number(line.discountAmount) || 0);
    const taxPercent = Math.max(0, Number(line.taxPercent) || 0);
    const taxRate = taxPercent / 100;

    const lineExtensionAmount = Number((qty * price - disc).toFixed(2));
    const lineVatAmount = Number((lineExtensionAmount * taxRate).toFixed(2));
    const lineInclusiveAmount = Number((lineExtensionAmount + lineVatAmount).toFixed(2));

    totalLineExtensionAmount += lineExtensionAmount;
    totalVatAmount += lineVatAmount;
    totalDiscountAmount += disc;

    return {
      id: line.id || String(idx + 1),
      itemName: line.itemName || 'صنف مبيعات',
      quantity: qty,
      priceBeforeTax: price,
      discountAmount: disc,
      taxPercent: taxPercent,
      lineExtensionAmount: lineExtensionAmount,
      vatAmount: lineVatAmount,
      inclusiveAmount: lineInclusiveAmount,
    };
  });

  const totalExclusiveAmount = Number(totalLineExtensionAmount.toFixed(2));
  const totalInclusiveAmount = Number((totalExclusiveAmount + totalVatAmount).toFixed(2));

  // Prepare Lines XML elements safely
  const linesXml = processedLines.map((line) => {
    return `  <cac:InvoiceLine>
    <cbc:ID>${escapeXml(line.id)}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="PCE">${line.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${currency}">${safeFormatNum(line.lineExtensionAmount)}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${currency}">${safeFormatNum(line.vatAmount)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${currency}">${safeFormatNum(line.lineExtensionAmount)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${currency}">${safeFormatNum(line.vatAmount)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:ID>S</cbc:ID>
          <cbc:Percent>${safeFormatNum(line.taxPercent)}</cbc:Percent>
          <cac:TaxScheme>
            <cbc:ID>VAT</cbc:ID>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${escapeXml(line.itemName)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${safeFormatNum(line.taxPercent)}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${currency}">${safeFormatNum(line.priceBeforeTax)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
  }).join('\n');

  // Format Seller fields safely (ensuring fallback rather than blank tag where necessary)
  const sellerPostal = `      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(input.sellerAddress || '-')}</cbc:StreetName>
        <cbc:CityName>${escapeXml(input.sellerCity || '-')}</cbc:CityName>
        <cbc:PostalZone>${escapeXml(input.sellerPostalCode || '-')}</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>SA</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>`;

  // Format Customer fields safely
  const customerPostal = `      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(input.customerAddress || '-')}</cbc:StreetName>
        <cbc:CityName>${escapeXml(input.customerCity || '-')}</cbc:CityName>
        <cac:Country>
          <cbc:IdentificationCode>SA</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>`;

  // Build root XML with strictly validated tags
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${escapeXml(input.invoiceNumber)}</cbc:ID>
  <cbc:UUID>${escapeXml(input.uuid)}</cbc:UUID>
  <cbc:IssueDate>${escapeXml(input.issueDate)}</cbc:IssueDate>
  <cbc:IssueTime>${escapeXml(input.issueTime)}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${invoiceCode}">388</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>${currency}</cbc:TaxCurrencyCode>
  
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID>${escapeXml(input.sellerCr || '-')}</cbc:ID>
      </cac:PartyIdentification>
${sellerPostal}
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(input.sellerVatNumber)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(input.sellerName)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID>${escapeXml(input.customerCr || '-')}</cbc:ID>
      </cac:PartyIdentification>
${customerPostal}
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(input.customerVatNumber || '-')}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(input.customerName || 'عميل نقدي')}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${safeFormatNum(totalVatAmount)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${safeFormatNum(totalExclusiveAmount)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">${safeFormatNum(totalVatAmount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>15.00</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${safeFormatNum(totalExclusiveAmount)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${safeFormatNum(totalExclusiveAmount)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${safeFormatNum(totalInclusiveAmount)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="${currency}">${safeFormatNum(totalDiscountAmount)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="${currency}">${safeFormatNum(totalInclusiveAmount)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

${linesXml}
</Invoice>`;

  return xml.trim();
}

/**
 * Calculates a SHA-256 hash representation of XML string (for validation or artifact tracking)
 */
export async function calculateXmlHash(xml: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(xml);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
