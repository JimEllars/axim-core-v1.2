/**
 * Shared AXiM Core Legal Constants for GCP Backend
 */

export const JURISDICTIONS = {
  AL: { name: 'Alabama', interestRate: 6.0, smallClaimsLimit: 6000 },
  AK: { name: 'Alaska', interestRate: 10.5, smallClaimsLimit: 10000 },
  AZ: { name: 'Arizona', interestRate: 10.0, smallClaimsLimit: 3500 },
  AR: { name: 'Arkansas', interestRate: 6.0, smallClaimsLimit: 5000 },
  CA: { name: 'California', interestRate: 10.0, smallClaimsLimit: 10000 },
  CO: { name: 'Colorado', interestRate: 8.0, smallClaimsLimit: 7500 },
  CT: { name: 'Connecticut', interestRate: 8.0, smallClaimsLimit: 5000 },
  DE: { name: 'Delaware', interestRate: 5.0, smallClaimsLimit: 15000 },
  FL: { name: 'Florida', interestRate: 6.0, smallClaimsLimit: 8000 },
  GA: { name: 'Georgia', interestRate: 7.0, smallClaimsLimit: 15000 },
  HI: { name: 'Hawaii', interestRate: 10.0, smallClaimsLimit: 5000 },
  ID: { name: 'Idaho', interestRate: 12.0, smallClaimsLimit: 5000 },
  IL: { name: 'Illinois', interestRate: 5.0, smallClaimsLimit: 10000 },
  IN: { name: 'Indiana', interestRate: 8.0, smallClaimsLimit: 8000 },
  IA: { name: 'Iowa', interestRate: 5.0, smallClaimsLimit: 6500 },
  KS: { name: 'Kansas', interestRate: 10.0, smallClaimsLimit: 4000 },
  KY: { name: 'Kentucky', interestRate: 8.0, smallClaimsLimit: 2500 },
  LA: { name: 'Louisiana', interestRate: 4.0, smallClaimsLimit: 5000 },
  ME: { name: 'Maine', interestRate: 8.0, smallClaimsLimit: 6000 },
  MD: { name: 'Maryland', interestRate: 6.0, smallClaimsLimit: 5000 },
  MA: { name: 'Massachusetts', interestRate: 12.0, smallClaimsLimit: 7000 },
  MI: { name: 'Michigan', interestRate: 5.0, smallClaimsLimit: 6500 },
  MN: { name: 'Minnesota', interestRate: 6.0, smallClaimsLimit: 15000 },
  MS: { name: 'Mississippi', interestRate: 8.0, smallClaimsLimit: 3500 },
  MO: { name: 'Missouri', interestRate: 9.0, smallClaimsLimit: 5000 },
  MT: { name: 'Montana', interestRate: 10.0, smallClaimsLimit: 7000 },
  NE: { name: 'Nebraska', interestRate: 12.0, smallClaimsLimit: 3900 },
  NV: { name: 'Nevada', interestRate: 2.0, smallClaimsLimit: 10000 },
  NH: { name: 'New Hampshire', interestRate: 10.0, smallClaimsLimit: 10000 },
  NJ: { name: 'New Jersey', interestRate: 3.5, smallClaimsLimit: 3000 },
  NM: { name: 'New Mexico', interestRate: 15.0, smallClaimsLimit: 10000 },
  NY: { name: 'New York', interestRate: 9.0, smallClaimsLimit: 5000 },
  NC: { name: 'North Carolina', interestRate: 8.0, smallClaimsLimit: 10000 },
  ND: { name: 'North Dakota', interestRate: 6.0, smallClaimsLimit: 15000 },
  OH: { name: 'Ohio', interestRate: 8.0, smallClaimsLimit: 6000 },
  OK: { name: 'Oklahoma', interestRate: 6.0, smallClaimsLimit: 10000 },
  OR: { name: 'Oregon', interestRate: 9.0, smallClaimsLimit: 10000 },
  PA: { name: 'Pennsylvania', interestRate: 6.0, smallClaimsLimit: 12000 },
  RI: { name: 'Rhode Island', interestRate: 12.0, smallClaimsLimit: 2500 },
  SC: { name: 'South Carolina', interestRate: 8.75, smallClaimsLimit: 7500 },
  SD: { name: 'South Dakota', interestRate: 10.0, smallClaimsLimit: 12000 },
  TN: { name: 'Tennessee', interestRate: 10.0, smallClaimsLimit: 25000 },
  TX: { name: 'Texas', interestRate: 5.0, smallClaimsLimit: 20000 },
  UT: { name: 'Utah', interestRate: 10.0, smallClaimsLimit: 11000 },
  VT: { name: 'Vermont', interestRate: 12.0, smallClaimsLimit: 5000 },
  VA: { name: 'Virginia', interestRate: 6.0, smallClaimsLimit: 5000 },
  WA: { name: 'Washington', interestRate: 12.0, smallClaimsLimit: 10000 },
  WV: { name: 'West Virginia', interestRate: 8.0, smallClaimsLimit: 5000 },
  WI: { name: 'Wisconsin', interestRate: 5.0, smallClaimsLimit: 10000 },
  WY: { name: 'Wyoming', interestRate: 7.0, smallClaimsLimit: 6000 },
};

export const MICRO_APPS = {
  DEMAND_LETTER: {
    id: 'demand_letter_generator',
    name: 'Demand Letter Generator',
    description: 'Generates state-compliant legal demand letters.',
    requiredData: ['jurisdiction', 'claimAmount', 'debtorName', 'creditorName'],
    schema: {
        type: "object",
        properties: {
             jurisdiction: { type: "string" },
             claimAmount: { type: "number" },
             debtorName: { type: "string" },
             creditorName: { type: "string" }
        },
        required: ["jurisdiction", "claimAmount", "debtorName", "creditorName"]
    }
  },
  NON_COMPETE: {
    id: 'non_compete_analyzer',
    name: 'Non-Compete Analyzer',
    description: 'Analyzes enforceability of non-compete clauses based on jurisdiction.',
    requiredData: ['jurisdiction', 'clauseText', 'employeeRole', 'industry'],
    schema: {
        type: "object",
        properties: {
            jurisdiction: { type: "string" },
            clauseText: { type: "string" },
            employeeRole: { type: "string" },
            industry: { type: "string" }
        },
        required: ["jurisdiction", "clauseText", "employeeRole", "industry"]
    }
  }
};
