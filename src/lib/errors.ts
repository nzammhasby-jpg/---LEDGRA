export function getErrorMessage(error: unknown): string {
  if (!error) return 'حدث خطأ غير متوقع.';

  let rawMessage = '';

  if (error instanceof Error) {
    rawMessage = error.message;
  } else if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    rawMessage = (error as { message: string }).message;
  } else if (typeof error === 'string') {
    rawMessage = error;
  }

  // 1. Network & Connectivity issues
  if (
    rawMessage === 'Failed to fetch' || 
    rawMessage.includes('Failed to fetch') || 
    rawMessage.includes('NetworkError') ||
    rawMessage.includes('Network request failed')
  ) {
    return 'تعذر الاتصال بالخادم الرئيسي (فشل الاتصال الشبكي). يرجى التأكد من اتصال الإنترنت أو إعدادات Supabase.';
  }

  // 2. PostgREST Schema cache & missing functions/columns/relations
  if (
    rawMessage.includes('schema cache') ||
    rawMessage.includes('Could not find the function') ||
    rawMessage.includes('PGRST202') ||
    (rawMessage.includes('does not exist') && (rawMessage.includes('function') || rawMessage.includes('column') || rawMessage.includes('relation')))
  ) {
    console.error('Database schema or function missing/unloaded:', rawMessage);
    return 'خدمة هذا التقرير أو الإجراء غير متاحة حالياً في قاعدة البيانات. يرجى التأكد من تطبيق تحديثات الـ Migrations وإعادة تحميل Schema Cache.';
  }

  // 3. Permission & Authorization issues
  if (
    rawMessage.includes('غير مصرح') ||
    rawMessage.includes('permission denied') ||
    rawMessage.includes('42501') ||
    rawMessage.includes('PGRST301') ||
    rawMessage.includes('JWT') ||
    rawMessage.includes('insufficient_privilege')
  ) {
    return 'ليس لديك صلاحية كافية لعرض هذا التقرير أو إتمام هذه العملية. (يتطلب دور المالك أو المدير أو المحاسب أو المستعرض).';
  }

  return rawMessage || 'حدث خطأ غير متوقع.';
}


