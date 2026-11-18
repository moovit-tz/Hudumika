import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Button } from '../../components/ui/button.js';
import { ApiKeysSection } from './ApiKeysSection.js';

export function ApiKeysPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={['Developer', 'API Keys']}
        titlePlain="API"
        titleEm="keys"
        subtitle="Secure access to your workspace, one integration at a time."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/developer?tab=marketplace">Browse APIs</Link>
          </Button>
        }
      />
      <ApiKeysSection />
    </div>
  );
}
