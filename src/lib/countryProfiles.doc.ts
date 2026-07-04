/**
 * Multi-Country Foundation (MC-1A) Documentation & Profile Verification
 * 
 * This file serves to document and verify the country profile behaviors for Saudi Arabia (SA) and Yemen (YE).
 */

import { 
  getCountryProfile, 
  validateCommercialRegistration, 
  validateTaxNumber, 
  validatePhone 
} from './countryProfiles';

export function runCountryProfilesVerification() {
  const results = {
    sa: {
      profile: getCountryProfile('SA'),
      crValid: validateCommercialRegistration('SA', '1010101010'),
      crInvalid: validateCommercialRegistration('SA', '12345'),
      vatValid: validateTaxNumber('SA', '300000000000003', true),
      vatInvalid: validateTaxNumber('SA', '12345', true),
      phoneValid: validatePhone('SA', '0512345678'),
      phoneInvalid: validatePhone('SA', '12345'),
    },
    ye: {
      profile: getCountryProfile('YE'),
      crValid: validateCommercialRegistration('YE', '777-ABC'), // Yemen is flexible
      vatValid: validateTaxNumber('YE', '123-456', true), // Yemen is flexible
      phoneValid: validatePhone('YE', '777123456'), // Yemen phone formats are flexible
    }
  };

  // Assertions logic to verify profiles meet requirements:
  // SA profile returns SAR/15/ZATCA true
  const isSaCorrect = 
    results.sa.profile.currencyCode === 'SAR' && 
    results.sa.profile.defaultTaxRate === 15 && 
    results.sa.profile.zatcaEnabled === true;

  // YE profile returns YER/0/ZATCA false
  const isYeCorrect = 
    results.ye.profile.currencyCode === 'YER' && 
    results.ye.profile.defaultTaxRate === 0 && 
    results.ye.profile.zatcaEnabled === false;

  console.log('--- Multi-Country Profiles Verification ---');
  console.log('Saudi Arabia (SA) Verification:', isSaCorrect ? 'SUCCESS ✅' : 'FAILED ❌');
  console.log('Yemen (YE) Verification:', isYeCorrect ? 'SUCCESS ✅' : 'FAILED ❌');
  console.log('-------------------------------------------');

  return {
    isSaCorrect,
    isYeCorrect,
    results
  };
}
