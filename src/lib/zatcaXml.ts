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
 * Escapes special characters to ensure valid XML.
 */
function escapeXml(unsafe: string | null | undefined): string {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates an initial UBL 2.1 e-invoice XML string.
 * This sets up the structures required for Saudi Arabia ZATCA Electronic Invoicing.
 */
export function generateInvoiceXml(input: ZatcaInvoiceXmlInput): string {
  const currency = input.currency || 'SAR';
  const invoiceCode = input.invoiceType === 'simplified' ? '0100000' : '0200000'; // Simplified or Standard subtype profile

  // Math totals
  let totalLineExtensionAmount = 0; // Sum of line extensions (qty * price - discount)
  let totalVatAmount = 0;           // Total VAT amount
  let totalExclusiveAmount = 0;     // Sum without VAT
  let totalInclusiveAmount = 0;     // Sum with VAT
  let totalDiscountAmount = 0;      // Sum of discounts

  // Process lines and calculate taxes
  const processedLines = input.lines.map((line, idx) => {
    const qty = Number(line.quantity) || 0;
    const price = Number(line.priceBeforeTax) || 0;
    const disc = Number(line.discountAmount) || 0;
    const taxRate = (Number(line.taxPercent) || 0) / 100;

    const lineExtensionAmount = qty * price - disc;
    const lineVatAmount = lineExtensionAmount * taxRate;
    const lineInclusiveAmount = lineExtensionAmount + lineVatAmount;

    totalLineExtensionAmount += lineExtensionAmount;
    totalVatAmount += lineVatAmount;
    totalDiscountAmount += disc;

    return {
      id: line.id || String(idx + 1),
      itemName: line.itemName,
      quantity: qty,
      priceBeforeTax: price,
      discountAmount: disc,
      taxPercent: line.taxPercent,
      lineExtensionAmount: Number(lineExtensionAmount.toFixed(2)),
      vatAmount: Number(lineVatAmount.toFixed(2)),
      inclusiveAmount: Number(lineInclusiveAmount.toFixed(2)),
    };
  });

  totalExclusiveAmount = totalLineExtensionAmount;
  totalInclusiveAmount = totalExclusiveAmount + totalVatAmount;

  // Prepare Lines XML
  const linesXml = processedLines.map((line) => {
    return `  <cac:InvoiceLine>
    <cbc:ID>${escapeXml(line.id)}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="PCE">${line.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${currency}">${line.lineExtensionAmount.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${currency}">${line.vatAmount.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${currency}">${line.lineExtensionAmount.toFixed(2)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${currency}">${line.vatAmount.toFixed(2)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:ID>S</cbc:ID>
          <cbc:Percent>${Number(line.taxPercent).toFixed(2)}</cbc:Percent>
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
        <cbc:Percent>${Number(line.taxPercent).toFixed(2)}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${currency}">${line.priceBeforeTax.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
  }).join('\n');

  // Format Seller fields
  const sellerPostal = `      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(input.sellerAddress || '-')}</cbc:StreetName>
        <cbc:CityName>${escapeXml(input.sellerCity || '-')}</cbc:CityName>
        <cbc:PostalZone>${escapeXml(input.sellerPostalCode || '-')}</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>SA</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>`;

  // Format Customer fields
  const customerPostal = `      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(input.customerAddress || '-')}</cbc:StreetName>
        <cbc:CityName>${escapeXml(input.customerCity || '-')}</cbc:CityName>
        <cac:Country>
          <cbc:IdentificationCode>SA</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>`;

  // Build root XML
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
        </cac:PartyTaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(input.customerName || 'عميل نقدي')}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${totalVatAmount.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${totalLineExtensionAmount.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">${totalVatAmount.toFixed(2)}</cbc:TaxAmount>
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
    <cbc:LineExtensionAmount currencyID="${currency}">${totalLineExtensionAmount.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${totalExclusiveAmount.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${totalInclusiveAmount.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="${currency}">${totalDiscountAmount.toFixed(2)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="${currency}">${totalInclusiveAmount.toFixed(2)}</cbc:PayableAmount>
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
