import { describe, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CompanyCard } from '../components/CompanyCard.js';

const mockCompany = { id: '1', name: 'Acme Corp', address: '123 Road', subscriptionPlan: 'Pro' };

function render(company: Record<string, unknown>) {
  return renderToStaticMarkup(<CompanyCard company={company} onEdit={vi.fn()} onDelete={vi.fn()} />);
}

describe('CompanyCard', () => {
  test('renders the company name, address and subscription plan', () => {
    const html = render(mockCompany);
    expect(html).toContain('Acme Corp');
    expect(html).toContain('123 Road');
    expect(html).toContain('Subscription: Pro');
  });

  test('falls back to the Free plan when none is set', () => {
    expect(render({ ...mockCompany, subscriptionPlan: undefined })).toContain('Subscription: Free');
  });

  test('offers Edit and Delete actions', () => {
    const html = render(mockCompany);
    expect(html).toMatch(/<button[^>]*>Edit<\/button>/);
    expect(html).toMatch(/<button[^>]*>Delete<\/button>/);
  });
});
