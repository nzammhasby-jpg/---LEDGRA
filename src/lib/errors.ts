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

  if (rawMessage === 'Failed to fetch' || rawMessage.includes('Failed to fetch') || rawMessage.includes('NetworkError')) {
    return 'تعذر الاتصال بالخادم الرئيسي (فشل الاتصال الشبكي). يرجى التأكد من اتصال الإنترنت أو إعدادات Supabase.';
  }

  return rawMessage || 'حدث خطأ غير متوقع.';
}

