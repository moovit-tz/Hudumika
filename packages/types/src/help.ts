import type { AppId, UserRole } from './user.js';

export type HelpAudience = 'all' | 'admins' | 'staff' | 'customers' | 'developers';

export type HelpCategoryKey =
  | 'getting-started'
  | 'workspace-admin'
  | 'app-guides'
  | 'customer-portal'
  | 'troubleshooting'
  | 'support';

export interface HelpCategory {
  key: HelpCategoryKey;
  title: string;
  shortDescription: string;
  icon: string;
  badge?: string;
  audiences: HelpAudience[];
}

export interface TourStep {
  target: string; // CSS selector or data-tour anchor
  title: string;
  content: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  actionPrompt?: string;
  fallbackUrl?: string;
}

export interface InteractiveTour {
  id: string;
  title: string;
  description: string;
  appId: AppId | 'workspace' | 'portal';
  targetPath: string;
  requiredRole?: UserRole[];
  steps: TourStep[];
}

export interface HelpArticle {
  slug: string;
  title: string;
  category: HelpCategoryKey;
  summary: string;
  appId?: AppId | 'workspace' | 'portal';
  audience: HelpAudience;
  requiredRoles?: UserRole[];
  prerequisites?: string[];
  steps?: Array<{
    number: number;
    title: string;
    instruction: string;
    actionTarget?: string;
    tip?: string;
  }>;
  expectedResult?: string;
  troubleshooting?: Array<{
    symptom: string;
    resolution: string;
  }>;
  tourId?: string;
  relatedArticleSlugs?: string[];
  lastVerified: string;
  keywords: string[];
}

export interface GettingStartedPhase {
  id: string;
  title: string;
  description: string;
  category: 'foundation' | 'security' | 'finance' | 'crm' | 'operations' | 'people' | 'compliance' | 'automate';
  targetRoles: UserRole[];
  estimatedMinutes: number;
  steps: Array<{
    id: string;
    title: string;
    description: string;
    href: string;
    requiredRole?: UserRole[];
    prerequisiteNote?: string;
    signalKey?: string; // Checkpoint or checklist signal key
    tourId?: string;
    articleSlug?: string;
  }>;
}

export interface UserTourProgress {
  userId: string;
  completedTourIds: string[];
  completedStepIds: string[];
  dismissedTourIds: string[];
  updatedAt: string;
}
