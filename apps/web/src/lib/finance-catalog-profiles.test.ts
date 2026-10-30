import { describe, expect, it } from 'vitest';
import { FINANCE_INDUSTRY_KEYS, FINANCE_CATALOG_PROFILES, financeCatalogOptions, financeCatalogProfile, catalogBillingDescription } from '@hudumika/types';

describe('industry catalogue and billing profiles',()=>{
  it.each(FINANCE_INDUSTRY_KEYS)('provides distinct billing and expense vocabulary for %s',key=>{
    const profile=FINANCE_CATALOG_PROFILES[key];
    expect(profile.categories.length).toBeGreaterThan(1);expect(profile.units.length).toBeGreaterThan(1);expect(profile.expenses.length).toBeGreaterThan(1);expect(profile.billingHint.length).toBeGreaterThan(20);
    expect(new Set(profile.fields.map(field=>field.key)).size).toBe(profile.fields.length);
    expect(profile.categories.every(value=>value.length<=100)).toBe(true);expect(profile.expenses.every(value=>value.length<=50)).toBe(true);
  });
  it('supports a multi-industry company without injecting logistics vocabulary',()=>{
    const combined=financeCatalogOptions(['construction','pharmaceutical','professional_services']);
    expect(combined.categories).toContain('BOQ work items');expect(combined.categories).toContain('Influencer campaigns');expect(combined.units).toContain('vial');expect(combined.expenses).toContain('Media spend');expect(combined.expenses).not.toContain('PORT_CHARGES');
    expect(new Set(combined.expenses).size).toBe(combined.expenses.length);
  });
  it('formats only the selected industry fields for document snapshots',()=>{
    const text=catalogBillingDescription({industry_key:'pharmaceutical',description:'Medicine supply',industry_attributes:{generic_name:'Example',strength:'100 mg',patient_name:'Never print'}});
    expect(text).toBe('Medicine supply\nGeneric name: Example\nStrength: 100 mg');expect(text).not.toContain('Never print');
    expect(financeCatalogProfile().units).toContain('hour');expect(financeCatalogOptions([]).categories).toContain('Services');
  });
});
