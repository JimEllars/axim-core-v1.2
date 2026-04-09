import { describe, it, expect } from 'vitest';
import { JURISDICTIONS, MICRO_APPS } from './legalConstants.js';

describe('legalConstants', () => {
  describe('JURISDICTIONS', () => {
    it('should be defined and not empty', () => {
      expect(JURISDICTIONS).toBeDefined();
      expect(Object.keys(JURISDICTIONS).length).toBeGreaterThan(0);
    });

    it('should contain expected properties for each jurisdiction', () => {
      for (const [code, data] of Object.entries(JURISDICTIONS)) {
        expect(typeof code).toBe('string');
        expect(code.length).toBe(2);
        expect(data).toHaveProperty('name');
        expect(typeof data.name).toBe('string');
        expect(data).toHaveProperty('interestRate');
        expect(typeof data.interestRate).toBe('number');
        expect(data).toHaveProperty('smallClaimsLimit');
        expect(typeof data.smallClaimsLimit).toBe('number');
      }
    });

    it('should include specific known states', () => {
      expect(JURISDICTIONS).toHaveProperty('CA');
      expect(JURISDICTIONS['CA'].name).toBe('California');
      expect(JURISDICTIONS).toHaveProperty('TX');
      expect(JURISDICTIONS['TX'].name).toBe('Texas');
      expect(JURISDICTIONS).toHaveProperty('NY');
      expect(JURISDICTIONS['NY'].name).toBe('New York');
    });
  });

  describe('MICRO_APPS', () => {
    it('should be defined and not empty', () => {
      expect(MICRO_APPS).toBeDefined();
      expect(Object.keys(MICRO_APPS).length).toBeGreaterThan(0);
    });

    it('should contain expected properties for DEMAND_LETTER', () => {
      const app = MICRO_APPS.DEMAND_LETTER;
      expect(app).toBeDefined();
      expect(app.id).toBe('demand_letter_generator');
      expect(app.name).toBe('Demand Letter Generator');
      expect(app.description).toBeTypeOf('string');

      expect(app.requiredData).toBeInstanceOf(Array);
      expect(app.requiredData).toContain('jurisdiction');
      expect(app.requiredData).toContain('claimAmount');
      expect(app.requiredData).toContain('debtorName');
      expect(app.requiredData).toContain('creditorName');

      expect(app.schema).toBeDefined();
      expect(app.schema.type).toBe('object');
      expect(app.schema.properties).toBeDefined();
      expect(app.schema.properties.jurisdiction.type).toBe('string');
      expect(app.schema.properties.claimAmount.type).toBe('number');
      expect(app.schema.properties.debtorName.type).toBe('string');
      expect(app.schema.properties.creditorName.type).toBe('string');

      expect(app.schema.required).toBeInstanceOf(Array);
      expect(app.schema.required).toContain('jurisdiction');
      expect(app.schema.required).toContain('claimAmount');
    });

    it('should contain expected properties for NON_COMPETE', () => {
      const app = MICRO_APPS.NON_COMPETE;
      expect(app).toBeDefined();
      expect(app.id).toBe('non_compete_analyzer');
      expect(app.name).toBe('Non-Compete Analyzer');
      expect(app.description).toBeTypeOf('string');

      expect(app.requiredData).toBeInstanceOf(Array);
      expect(app.requiredData).toContain('jurisdiction');
      expect(app.requiredData).toContain('clauseText');
      expect(app.requiredData).toContain('employeeRole');
      expect(app.requiredData).toContain('industry');

      expect(app.schema).toBeDefined();
      expect(app.schema.type).toBe('object');
      expect(app.schema.properties).toBeDefined();
      expect(app.schema.properties.jurisdiction.type).toBe('string');
      expect(app.schema.properties.clauseText.type).toBe('string');
      expect(app.schema.properties.employeeRole.type).toBe('string');
      expect(app.schema.properties.industry.type).toBe('string');

      expect(app.schema.required).toBeInstanceOf(Array);
      expect(app.schema.required).toContain('jurisdiction');
      expect(app.schema.required).toContain('clauseText');
    });

    it('every MICRO_APP should have a consistent structure', () => {
        for (const [key, app] of Object.entries(MICRO_APPS)) {
            expect(typeof key).toBe('string');
            expect(app).toHaveProperty('id');
            expect(typeof app.id).toBe('string');
            expect(app).toHaveProperty('name');
            expect(typeof app.name).toBe('string');
            expect(app).toHaveProperty('description');
            expect(typeof app.description).toBe('string');
            expect(app).toHaveProperty('requiredData');
            expect(app.requiredData).toBeInstanceOf(Array);
            expect(app).toHaveProperty('schema');
            expect(typeof app.schema).toBe('object');
            expect(app.schema.type).toBe('object');
            expect(app.schema).toHaveProperty('properties');
            expect(app.schema).toHaveProperty('required');
            expect(app.schema.required).toBeInstanceOf(Array);
        }
    });
  });
});
