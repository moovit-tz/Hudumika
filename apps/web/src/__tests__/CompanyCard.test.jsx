import { render, screen, fireEvent } from '@testing-library/react';
import { CompanyCard } from '../../components/CompanyCard.jsx';

const mockCompany = { id: '1', name: 'Acme Corp', address: '123 Road', subscriptionPlan: 'Pro' };

test('renders company card with name and plan', () => {
  const onEdit = jest.fn();
  const onDelete = jest.fn();
  render(<CompanyCard company={mockCompany} onEdit={onEdit} onDelete={onDelete} />);
  expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  expect(screen.getByText('Subscription: Pro')).toBeInTheDocument();
});

