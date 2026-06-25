/**
 * ZATCA TLV & Base64 QR Code generator for Saudi Saudi Arabian electronic invoices.
 * Designed to encoding standard UTF-8 texts (supports Arabic seller name correctly).
 */

export interface ZatcaQrInput {
  sellerName: string;
  vatNumber: string;
  timestamp: string; // Must be in ISO-8601 formatting, e.g. YYYY-MM-DDTHH:mm:ssZ
  invoiceTotal: number;
  vatTotal: number;
}

/**
 * Converts a Uint8Array into a standard Base64 string.
 * This is browser-safe and does not depend on Node.js Buffer module.
 */
export function uint8ArrayToBase64(arr: Uint8Array): string {
  let binary = '';
  const len = arr.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

/**
 * Encodes a tag, length, and value into TLV Uint8Array.
 * Length is checked based on UTF-8 byte length of string.
 */
function buildTlvElement(tag: number, value: string): Uint8Array {
  const encoder = new TextEncoder();
  const valueBytes = encoder.encode(value);
  const length = valueBytes.length;

  if (length > 255) {
    throw new Error(`ZATCA TLV encoding error: tag ${tag} value is too long (${length} bytes). Max is 255.`);
  }

  const tlv = new Uint8Array(2 + length);
  tlv[0] = tag;
  tlv[1] = length;
  tlv.set(valueBytes, 2);
  return tlv;
}

/**
 * Generates the standard ZATCA TLV Base64 representation.
 * Supports standard 5 fields:
 * 1. Seller Name (Tag 1)
 * 2. VAT Number (Tag 2)
 * 3. Timestamp (Tag 3)
 * 4. Invoice Total (Tag 4)
 * 5. VAT Total (Tag 5)
 */
export function generateZatcaQrBase64(input: ZatcaQrInput): string {
  if (!input.sellerName) throw new Error('Seller Name is required for ZATCA QR Code');
  if (!input.vatNumber) throw new Error('Seller VAT number is required for ZATCA QR Code');
  if (!input.timestamp) throw new Error('Timestamp is required for ZATCA QR Code');
  if (input.invoiceTotal === undefined || isNaN(input.invoiceTotal)) {
    throw new Error('Invoice Total is required for ZATCA QR Code');
  }
  if (input.vatTotal === undefined || isNaN(input.vatTotal)) {
    throw new Error('VAT Total is required for ZATCA QR Code');
  }

  // Format floats strictly with English numerals up to 2 decimal places
  const totalStr = Number(input.invoiceTotal).toFixed(2);
  const vatStr = Number(input.vatTotal).toFixed(2);

  const tlv1 = buildTlvElement(1, input.sellerName);
  const tlv2 = buildTlvElement(2, input.vatNumber);
  const tlv3 = buildTlvElement(3, input.timestamp);
  const tlv4 = buildTlvElement(4, totalStr);
  const tlv5 = buildTlvElement(5, vatStr);

  // Combine arrays
  const totalLength = tlv1.length + tlv2.length + tlv3.length + tlv4.length + tlv5.length;
  const combined = new Uint8Array(totalLength);

  let offset = 0;
  combined.set(tlv1, offset);
  offset += tlv1.length;

  combined.set(tlv2, offset);
  offset += tlv2.length;

  combined.set(tlv3, offset);
  offset += tlv3.length;

  combined.set(tlv4, offset);
  offset += tlv4.length;

  combined.set(tlv5, offset);

  return uint8ArrayToBase64(combined);
}

/**
 * Parses and decodes a ZATCA TLV Base64 back to tag-value map (primarily for debugging or validation)
 */
export function decodeZatcaQrBase64(base64: string): Record<number, string> {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const decoder = new TextDecoder('utf-8');
  const result: Record<number, string> = {};
  let index = 0;

  while (index < bytes.length) {
    if (index + 2 > bytes.length) break;
    const tag = bytes[index];
    const length = bytes[index + 1];
    index += 2;

    if (index + length > bytes.length) break;
    const valueBytes = bytes.subarray(index, index + length);
    result[tag] = decoder.decode(valueBytes);
    index += length;
  }

  return result;
}
