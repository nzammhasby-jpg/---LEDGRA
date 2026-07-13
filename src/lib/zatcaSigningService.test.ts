import { describe, it, expect } from 'vitest';
import { zatcaSigningService } from './zatcaSigningService';
import { ZatcaSigningProfile } from '../types';

describe('ZATCA Signing Service and Security Checks', () => {
  describe('detectPrivateKeyLeak', () => {
    it('should detect standard private key boundary strings', () => {
      expect(zatcaSigningService.detectPrivateKeyLeak('-----BEGIN PRIVATE KEY-----')).toBe(true);
      expect(zatcaSigningService.detectPrivateKeyLeak('-----BEGIN RSA PRIVATE KEY-----')).toBe(true);
      expect(zatcaSigningService.detectPrivateKeyLeak('-----BEGIN EC PRIVATE KEY-----')).toBe(true);
      expect(zatcaSigningService.detectPrivateKeyLeak('SOME CONTENT PRIVATE KEY-----')).toBe(true);
    });

    it('should ignore text without private key boundary strings', () => {
      expect(zatcaSigningService.detectPrivateKeyLeak('-----BEGIN CERTIFICATE REQUEST-----')).toBe(false);
      expect(zatcaSigningService.detectPrivateKeyLeak('-----BEGIN CERTIFICATE-----')).toBe(false);
      expect(zatcaSigningService.detectPrivateKeyLeak('Hello, world!')).toBe(false);
      expect(zatcaSigningService.detectPrivateKeyLeak(null)).toBe(false);
      expect(zatcaSigningService.detectPrivateKeyLeak(undefined)).toBe(false);
    });
  });

  describe('validateSigningProfileInput', () => {
    it('should fail validation if any text field contains a private key leak', () => {
      const badInput: Partial<ZatcaSigningProfile> = {
        csr_common_name: '-----BEGIN PRIVATE KEY-----'
      };

      const result = zatcaSigningService.validateSigningProfileInput(badInput);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('لا يمكن حفظ المفتاح الخاص داخل الواجهة');
    });

    it('should fail if CSR PEM is provided but lacks valid boundary tags', () => {
      const inputWithBadCsr: Partial<ZatcaSigningProfile> = {
        csr_pem: 'INVALID CSR TEXT'
      };

      const result = zatcaSigningService.validateSigningProfileInput(inputWithBadCsr);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('نص CSR PEM غير صالح');
    });

    it('should fail if Certificate PEM is provided but lacks valid boundary tags', () => {
      const inputWithBadCert: Partial<ZatcaSigningProfile> = {
        certificate_pem: 'INVALID CERT TEXT'
      };

      const result = zatcaSigningService.validateSigningProfileInput(inputWithBadCert);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('نص Certificate PEM غير صالح');
    });

    it('should pass if all fields are clean and properly structured', () => {
      const cleanInput: Partial<ZatcaSigningProfile> = {
        csr_common_name: 'My Corp',
        csr_pem: '-----BEGIN CERTIFICATE REQUEST-----\ncontent\n-----END CERTIFICATE REQUEST-----',
        certificate_pem: '-----BEGIN CERTIFICATE-----\ncontent\n-----END CERTIFICATE-----'
      };

      const result = zatcaSigningService.validateSigningProfileInput(cleanInput);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('getSigningReadiness', () => {
    it('should mark readiness as false if any critical check fails', () => {
      const incompleteSettings = {
        seller_name: 'Company',
        seller_vat_number: '', // critical field empty
        is_enabled: true
      };

      const profile: ZatcaSigningProfile = {
        id: '1',
        organization_id: 'org1',
        environment: 'simulation',
        profile_status: 'csr_metadata_ready',
        csr_common_name: 'Common',
        csr_serial_number: '123',
        csr_organization_identifier: '312345',
        csr_organization_unit_name: null,
        csr_organization_name: 'Org',
        csr_country_name: 'SA',
        csr_invoice_type: '1100',
        csr_location: 'Riyadh',
        csr_industry: 'Retail',
        csr_pem: '-----BEGIN CERTIFICATE REQUEST-----',
        certificate_pem: '-----BEGIN CERTIFICATE-----',
        csid_value: 'csid_val',
        csid_type: 'production',
        certificate_subject: 'Subj',
        certificate_issuer: 'Issuer',
        certificate_valid_from: null,
        certificate_valid_to: null,
        private_key_storage_mode: 'not_stored',
        private_key_secret_reference: null,
        notes: null,
        created_at: '',
        updated_at: ''
      };

      const readiness = zatcaSigningService.getSigningReadiness(profile, incompleteSettings, { passed: 1 });
      expect(readiness.isReady).toBe(false);
      
      const failedCheck = readiness.checks.find(c => c.title.includes('بيانات المنشأة والمالك مكتملة'));
      expect(failedCheck?.checked).toBe(false);
    });

    it('should mark readiness as true if all critical checks are satisfied', () => {
      const completeSettings = {
        seller_name: 'My Store',
        seller_vat_number: '300012345600003',
        seller_address: 'Al-Olaya Street',
        seller_city: 'Riyadh',
        is_enabled: true
      };

      const profile: ZatcaSigningProfile = {
        id: '1',
        organization_id: 'org1',
        environment: 'simulation',
        profile_status: 'ready_for_integration',
        csr_common_name: 'My Store',
        csr_serial_number: '123',
        csr_organization_identifier: '300012345600003',
        csr_organization_unit_name: null,
        csr_organization_name: 'My Store',
        csr_country_name: 'SA',
        csr_invoice_type: '1100',
        csr_location: 'Riyadh',
        csr_industry: 'Retail',
        csr_pem: '-----BEGIN CERTIFICATE REQUEST-----',
        certificate_pem: '-----BEGIN CERTIFICATE-----',
        csid_value: 'csid_val',
        csid_type: 'production',
        certificate_subject: 'Subj',
        certificate_issuer: 'Issuer',
        certificate_valid_from: null,
        certificate_valid_to: null,
        private_key_storage_mode: 'not_stored',
        private_key_secret_reference: null,
        notes: null,
        created_at: '',
        updated_at: ''
      };

      const readiness = zatcaSigningService.getSigningReadiness(profile, completeSettings, { passed: 1 });
      expect(readiness.isReady).toBe(true);
    });
  });
});
