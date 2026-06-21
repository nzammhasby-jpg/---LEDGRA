import { supabase } from './supabase';
import { Organization } from '../types';

export const organizationSettingsService = {
  async getOrganization(orgId: string): Promise<Organization> {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();

    if (error) throw error;
    return data as Organization;
  },

  async updateOrganization(orgId: string, updates: Partial<Organization>): Promise<Organization> {
    const { data, error } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', orgId)
      .select()
      .single();

    if (error) throw error;
    return data as Organization;
  },

  async uploadLogo(orgId: string, file: File): Promise<string> {
    // 1. Validate file size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      throw new Error('حجم الملف كبير جداً! الحد الأقصى هو 2 ميجابايت.');
    }

    // 2. Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('نوع الملف غير مدعوم! الرجاء رفع صورة بصيغة png, jpg, jpeg أو webp.');
    }

    // 3. Create a safe file name
    const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
    const filename = `${Date.now()}_logo.${extension}`;
    const filePath = `${orgId}/logo/${filename}`;

    // 4. Upload to Storage
    const { error: uploadError } = await supabase.storage
      .from('organization-assets')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // 5. Update database logo_url with relative filePath
    await this.updateOrganization(orgId, { logo_url: filePath });

    return filePath;
  },

  async getLogoSignedUrl(path: string | null): Promise<string | null> {
    if (!path) return null;

    // Compatibility check: If it is already a full legacy public URL, return it directly
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    try {
      const { data, error } = await supabase.storage
        .from('organization-assets')
        .createSignedUrl(path, 3600); // 1 hour expiration

      if (error) {
        console.error('Error creating signed URL:', error);
        return null;
      }
      return data?.signedUrl || null;
    } catch (e) {
      console.error('Error generating signed URL:', e);
      return null;
    }
  },

  async deleteLogo(orgId: string): Promise<void> {
    const org = await this.getOrganization(orgId);
    if (!org.logo_url) return;

    try {
      let filePath = org.logo_url;
      if (org.logo_url.includes('/organization-assets/')) {
        const urlParts = org.logo_url.split('/organization-assets/');
        if (urlParts.length > 1) {
          filePath = decodeURIComponent(urlParts[1]);
        }
      }
      
      await supabase.storage
        .from('organization-assets')
        .remove([filePath]);
    } catch (e) {
      console.error('Error removing logo file from storage:', e);
    }

    // Update DB
    await this.updateOrganization(orgId, { logo_url: null });
  }
};
