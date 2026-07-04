export type SupportedCountryCode = 'SA' | 'YE';

export interface CountryProfile {
  code: SupportedCountryCode;
  nameAr: string;
  nameEn: string;
  currencyCode: string;
  currencyNameAr: string;
  currencySymbol: string;
  phonePlaceholder: string;
  crLabel: string;
  crRequired: boolean;
  vatLabel: string;
  vatRequiredWhenRegistered: boolean;
  defaultTaxRate: number;
  zatcaEnabled: boolean;
  cities: string[];
  invoiceTitle: string;
  taxInvoiceTitle: string;
  normalInvoiceTitle: string;
}

export const countryProfiles: Record<SupportedCountryCode, CountryProfile> = {
  SA: {
    code: 'SA',
    nameAr: 'المملكة العربية السعودية',
    nameEn: 'Saudi Arabia',
    currencyCode: 'SAR',
    currencyNameAr: 'ريال سعودي',
    currencySymbol: 'ر.س',
    phonePlaceholder: '05xxxxxxxx',
    crLabel: 'السجل التجاري',
    crRequired: true,
    vatLabel: 'الرقم الضريبي',
    vatRequiredWhenRegistered: true,
    defaultTaxRate: 15,
    zatcaEnabled: true,
    cities: [
      'الرياض',
      'جدة',
      'مكة المكرمة',
      'المدينة المنورة',
      'الدمام',
      'الخبر',
      'الجبيل',
      'الأحساء',
      'تبوك',
      'خميس مشيط',
      'الطائف',
      'حائل',
      'بريدة',
      'أبها',
      'جازان',
      'نجران'
    ],
    invoiceTitle: 'فاتورة ضريبية',
    taxInvoiceTitle: 'فاتورة ضريبية',
    normalInvoiceTitle: 'فاتورة مبسطة'
  },
  YE: {
    code: 'YE',
    nameAr: 'الجمهورية اليمنية',
    nameEn: 'Yemen',
    currencyCode: 'YER',
    currencyNameAr: 'ريال يمني',
    currencySymbol: 'ر.ي',
    phonePlaceholder: '7xxxxxxxx',
    crLabel: 'رقم السجل / الترخيص',
    crRequired: false,
    vatLabel: 'الرقم الضريبي / رقم المكلّف',
    vatRequiredWhenRegistered: false,
    defaultTaxRate: 0,
    zatcaEnabled: false,
    cities: [
      'صنعاء',
      'عدن',
      'تعز',
      'إب',
      'الحديدة',
      'المكلا',
      'ذمار',
      'حضرموت',
      'مأرب'
    ],
    invoiceTitle: 'فاتورة مبيعات',
    taxInvoiceTitle: 'فاتورة ضريبية',
    normalInvoiceTitle: 'فاتورة مبيعات'
  }
};

export function getCountryProfile(countryCode: string | null | undefined): CountryProfile {
  const code = (countryCode || 'SA').toUpperCase() as SupportedCountryCode;
  return countryProfiles[code] || countryProfiles.SA;
}

export function getDefaultCountryProfile(): CountryProfile {
  return countryProfiles.SA;
}

export function validateCommercialRegistration(
  countryCode: string | null | undefined,
  value: string | null | undefined
): { isValid: boolean; errorAr?: string } {
  const code = (countryCode || 'SA').toUpperCase() as SupportedCountryCode;
  const val = (value || '').trim();

  if (code === 'SA') {
    if (!val) {
      return { isValid: false, errorAr: 'رقم السجل التجاري مطلوب.' };
    }
    const cleanVal = val.replace(/\s+/g, '');
    if (!/^\d{10}$/.test(cleanVal)) {
      return { isValid: false, errorAr: 'رقم السجل التجاري السعودي يجب أن يتكون من 10 أرقام.' };
    }
  }
  return { isValid: true };
}

export function validateTaxNumber(
  countryCode: string | null | undefined,
  value: string | null | undefined,
  isVatRegistered: boolean
): { isValid: boolean; errorAr?: string } {
  const code = (countryCode || 'SA').toUpperCase() as SupportedCountryCode;
  const val = (value || '').trim();

  if (isVatRegistered) {
    if (!val) {
      return { isValid: false, errorAr: 'الرقم الضريبي مطلوب للمنشآت المسجلة في ضريبة القيمة المضافة.' };
    }
    if (code === 'SA') {
      const cleanVal = val.replace(/\s+/g, '');
      if (!/^3\d{13}3$/.test(cleanVal)) {
        return { isValid: false, errorAr: 'الرقم الضريبي السعودي يجب أن يتكون من 15 رقم يبدأ بـ 3 وينتهي بـ 3.' };
      }
    }
  }
  return { isValid: true };
}

export function validatePhone(
  countryCode: string | null | undefined,
  value: string | null | undefined
): { isValid: boolean; errorAr?: string } {
  const code = (countryCode || 'SA').toUpperCase() as SupportedCountryCode;
  const val = (value || '').trim();

  if (!val) {
    return { isValid: false, errorAr: 'رقم الجوال مطلوب.' };
  }

  if (code === 'SA') {
    const cleanVal = val.replace(/[\s\-+]/g, '');
    if (/^9665\d{8}$/.test(cleanVal)) {
      return { isValid: true };
    }
    if (/^5\d{8}$/.test(cleanVal)) {
      return { isValid: true };
    }
    if (/^05\d{8}$/.test(cleanVal)) {
      return { isValid: true };
    }
    return { isValid: false, errorAr: 'رقم الجوال غير صحيح. يجب أن يبدأ بـ 05 أو 5 أو مفتاح البلد 966.' };
  } else if (code === 'YE') {
    const cleanVal = val.replace(/[\s\-+]/g, '');
    if (/^967\d{9}$/.test(cleanVal)) {
      return { isValid: true };
    }
    if (/^7\d{8}$/.test(cleanVal)) {
      return { isValid: true };
    }
    if (cleanVal.length >= 7 && /^\d+$/.test(cleanVal)) {
      return { isValid: true };
    }
    return { isValid: false, errorAr: 'رقم الجوال اليمني غير صحيح.' };
  }

  return { isValid: true };
}
