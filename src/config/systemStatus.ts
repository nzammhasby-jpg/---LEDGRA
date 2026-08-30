/**
 * System Status and Maintenance Configuration
 * 
 * controls whether the system is under maintenance / updating mode.
 * When isMaintenanceMode is true, users cannot access any screens and will see
 * the dedicated "System Update in Progress" page.
 */

export interface SystemStatusConfig {
  isMaintenanceMode: boolean;
  title: string;
  subtitle: string;
  message: string;
  version: string;
  estimatedReturnTime?: string;
  supportEmail: string;
  showLiveStatus: boolean;
}

export const SYSTEM_STATUS_CONFIG: SystemStatusConfig = {
  // Maintenance mode turned off - system is fully operational
  isMaintenanceMode: false,
  title: 'جاري التحديث والتطوير الدوري لنظام لِدجرا',
  subtitle: 'نعمل حالياً على إجراء تحسينات وترقيات برمجية شاملة لتقديم أعلى مستويات الأداء والأمان.',
  message: 'تم تعليق الوصول إلى النظام مؤقتاً لجميع المستخدمين لحماية سلامة السجلات والبيانات المحاسبية أثناء تطبيق التحديثات السحابية. سنعود للعمل بكامل الميزات والخدمات في أقرب وقت.',
  version: 'LEDGRA Core v2.4.0 — Cloud Update',
  estimatedReturnTime: 'قريباً جداً فور اكتمال المزامنة',
  supportEmail: 'support@ledgra.com',
  showLiveStatus: true,
};
