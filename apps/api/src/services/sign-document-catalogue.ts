import type { AppId, SignDocumentDefinition, SignDocumentType } from '@hudumika/types';
import { draftedDefinition } from './sign-document-drafting.js';

export interface CatalogueGroup { apps: AppId[]; category: string; entries: string[] }
export interface CatalogueStarter { id: string; name: string; description: string; document_definition: SignDocumentDefinition }

// The catalogue identifies subjects; the drafting layer supplies operative clauses and fact-only questions.
export function buildCatalogue(groups: CatalogueGroup[]): CatalogueStarter[] {
  const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const seenIds = new Set<string>();
  return groups.flatMap(group => group.entries.flatMap(entry => {
    const [name, type, topics] = entry.split('|');
    const sections = topics.split(';');
    let id = `starter-${group.apps[0]}-${slug(name).replace(/_/g, '-')}`;
    if (seenIds.has(id)) {
      id = `starter-${group.apps[0]}-${slug(group.category).replace(/_/g, '-')}-${slug(name).replace(/_/g, '-')}`;
    }
    if (seenIds.has(id)) return [];
    seenIds.add(id);
    return [{
      id, name,
      description: `Prepare ${name.toLowerCase()} covering ${sections.slice(0, 3).map(section => section.toLowerCase()).join(', ')}. Adapt wording and execution requirements to the selected jurisdiction.`,
      document_definition: { apps: group.apps, document_type: type as SignDocumentType, category: group.category, jurisdictions: [], ...draftedDefinition(name,type as SignDocumentType,sections) },
    }];
  }));
}

import { businessCatalogue } from './sign-document-catalogue-business.js';
import { operationsCatalogue } from './sign-document-catalogue-operations.js';
import { platformCatalogue } from './sign-document-catalogue-platform.js';
import { lawdepotCatalogue } from './sign-document-catalogue-lawdepot.js';
export const additionalDocumentStarters = buildCatalogue([...businessCatalogue, ...operationsCatalogue, ...platformCatalogue, ...lawdepotCatalogue]);
