'use strict';

/**
 * Mock lead data for the demo (no real LeadZam API involved).
 * "Anita Verma" has a deliberately malformed number so you can demonstrate the
 * validation-error path from the dashboard.
 */
const LEADS = [
  { id: 'lead-1', name: 'Rahul Sharma', phone: '+91 98765 43210', stage: 'Interested', company: 'Sharma Traders' },
  { id: 'lead-2', name: 'Priya Nair', phone: '+91 91234 56780', stage: 'Follow-up', company: 'Nair Textiles' },
  { id: 'lead-3', name: 'Amit Patel', phone: '+91 99887 76655', stage: 'New', company: 'Patel Logistics' },
  { id: 'lead-4', name: 'Anita Verma', phone: '98-ABC-12', stage: 'Negotiation', company: 'Verma Foods' },
];

function listLeads() {
  return LEADS.map((lead) => ({ ...lead }));
}

module.exports = { listLeads };
