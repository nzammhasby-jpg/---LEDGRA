import React, { useEffect, useState } from 'react';
import { Organization } from '../../types';
import { organizationSettingsService } from '../../lib/organizationSettingsService';

interface PrintHeaderProps {
  currentOrg: Organization | null;
  documentTitle: string;
  documentNumber?: string;
  documentDate?: string;
  extraMeta?: { label: string; value: string }[];
}

export const PrintHeader: React.FC<PrintHeaderProps> = ({
  currentOrg,
  documentTitle,
  documentNumber,
  documentDate,
  extraMeta = []
}) => {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (currentOrg?.logo_url) {
      if (currentOrg.logo_url.startsWith('http://') || currentOrg.logo_url.startsWith('https://')) {
        setLogoUrl(currentOrg.logo_url);
      } else {
        organizationSettingsService.getLogoSignedUrl(currentOrg.logo_url)
          .then(url => {
            if (active) setLogoUrl(url);
          })
          .catch(err => {
            console.error('Failed to retrieve logo signed URL:', err);
            if (active) setLogoUrl(null);
          });
      }
    } else {
      setLogoUrl(null);
    }
    return () => {
      active = false;
    };
  }, [currentOrg?.logo_url]);

  if (!currentOrg) return null;

  const primaryColor = currentOrg.print_primary_color || '#111827';
  const showLogo = currentOrg.show_logo_on_print ?? true;
  const showTax = currentOrg.show_tax_number_on_print ?? true;
  const showCR = currentOrg.show_commercial_registration_on_print ?? true;

  return (
    <div className="border-b-2 pb-5 mb-6 text-right font-sans" style={{ borderBottomColor: primaryColor }} dir="rtl">
      <div className="flex justify-between items-start gap-8">
        
        {/* Right side: Corporation official record info */}
        <div className="space-y-1.5 flex-1 select-none">
          <div className="text-lg font-black text-slate-900">{currentOrg.name_ar}</div>
          {currentOrg.name_en && (
            <div className="text-xs font-bold text-slate-500 font-mono tracking-tight uppercase">
              {currentOrg.name_en}
            </div>
          )}
          
          <div className="text-[11px] text-slate-600 space-y-0.5 pt-1.5 font-sans leading-relaxed">
            {showCR && currentOrg.cr_number && (
              <div>
                <span className="font-bold text-slate-700">السجل التجاري (CR): </span>
                <span className="font-mono">{currentOrg.cr_number}</span>
              </div>
            )}
            {showTax && currentOrg.is_vat_registered && currentOrg.vat_number && (
              <div>
                <span className="font-bold text-slate-700">الرقم الضريبي (VAT ID): </span>
                <span className="font-mono">{currentOrg.vat_number}</span>
              </div>
            )}
            {(currentOrg.phone || currentOrg.email || currentOrg.website) && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {currentOrg.phone && (
                  <div>
                    <span className="font-bold text-slate-700">الهاتف: </span>
                    <span className="font-mono">{currentOrg.phone}</span>
                  </div>
                )}
                {currentOrg.email && (
                  <div>
                    <span className="font-bold text-slate-700">البريد: </span>
                    <span className="font-mono text-slate-500">{currentOrg.email}</span>
                  </div>
                )}
                {currentOrg.website && (
                  <div>
                    <span className="font-bold text-slate-700">الموقع: </span>
                    <span className="font-mono text-slate-500">{currentOrg.website}</span>
                  </div>
                )}
              </div>
            )}
            {(currentOrg.address_line || currentOrg.city || currentOrg.postal_code) && (
              <div>
                <span className="font-bold text-slate-700">العنوان: </span>
                <span>
                  {[
                    currentOrg.address_line,
                    currentOrg.city,
                    currentOrg.postal_code ? `الرمز البريدي: ${currentOrg.postal_code}` : '',
                    currentOrg.country && currentOrg.country !== 'المملكة العربية السعودية' ? currentOrg.country : ''
                  ].filter(Boolean).join('، ')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Center: Brand Logo (Only if showLogo and url exists) */}
        {showLogo && currentOrg.logo_url && logoUrl && (
          <div className="hidden sm:flex justify-center items-center h-20 w-32 shrink-0 select-none">
            <img 
              src={logoUrl} 
              alt="Logo" 
              referrerPolicy="no-referrer"
              className="max-h-full max-w-full object-contain"
              onError={() => setLogoUrl(null)}
            />
          </div>
        )}

        {/* Left side: Document identity & type descriptors */}
        <div className="text-left space-y-2 shrink-0 select-none" style={{ direction: 'ltr' }}>
          
          <div className="text-white font-black text-sm px-4 py-2 rounded-lg text-center" style={{ direction: 'rtl', backgroundColor: primaryColor }}>
            {documentTitle}
          </div>

          <div className="text-xs text-slate-600 space-y-1 leading-normal" style={{ direction: 'rtl' }}>
            {documentNumber && (
              <div className="flex justify-between gap-4 border-b border-dashed border-slate-200 pb-1">
                <span className="text-slate-450 font-bold">الرقم:</span>
                <span className="font-mono font-black text-slate-900">{documentNumber}</span>
              </div>
            )}
            {documentDate && (
              <div className="flex justify-between gap-4 border-b border-dashed border-slate-200 pb-1">
                <span className="text-slate-450 font-bold">التاريخ:</span>
                <span className="font-mono font-black text-slate-900">{documentDate}</span>
              </div>
            )}
            {extraMeta.map((meta, i) => (
              <div key={i} className="flex justify-between gap-4 border-b border-dashed border-slate-200 pb-1">
                <span className="text-slate-450 font-bold">{meta.label}:</span>
                <span className="font-black text-slate-900">{meta.value}</span>
              </div>
            ))}
          </div>

        </div>

      </div>
    </div>
  );
};
