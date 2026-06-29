import { supabase } from './supabase';

export const auditService = {
  async logAction(
    orgId: string, 
    profileId: string | null, 
    action: string, 
    details: Record<string, unknown>
  ): Promise<void> {
    try {
      const { error } = await supabase.rpc('log_safe_editing_audit', {
        p_org_id: orgId,
        p_action: action,
        p_details: details
      });

      if (error) {
        console.error('Failed to log audit via RPC:', error);
        alert('تمت العملية، لكن تعذر حفظ سجل التدقيق. راجع السجلات لاحقًا.');
      }
    } catch (err) {
      console.error('Error in logAction:', err);
      alert('تمت العملية، لكن تعذر حفظ سجل التدقيق. راجع السجلات لاحقًا.');
    }
  }
};
