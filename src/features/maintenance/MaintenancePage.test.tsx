import { describe, it, expect } from 'vitest';
import { SYSTEM_STATUS_CONFIG } from '../../config/systemStatus';

describe('System Maintenance Configuration & Logic Tests', () => {
  it('has maintenance mode disabled for active operation', () => {
    expect(SYSTEM_STATUS_CONFIG.isMaintenanceMode).toBe(false);
    expect(SYSTEM_STATUS_CONFIG.title).toBe('جاري التحديث والتطوير الدوري لنظام لِدجرا');
    expect(SYSTEM_STATUS_CONFIG.showLiveStatus).toBe(true);
  });

  it('contains clear reassuring messaging about data protection during upgrade', () => {
    expect(SYSTEM_STATUS_CONFIG.message).toContain('تم تعليق الوصول إلى النظام مؤقتاً');
    expect(SYSTEM_STATUS_CONFIG.message).toContain('لحماية سلامة السجلات والبيانات المحاسبية');
    expect(SYSTEM_STATUS_CONFIG.subtitle).toContain('تحسينات وترقيات برمجية');
  });

  it('has version and estimated return time defined', () => {
    expect(SYSTEM_STATUS_CONFIG.version).toContain('LEDGRA Core');
    expect(SYSTEM_STATUS_CONFIG.estimatedReturnTime).toBeDefined();
  });
});
