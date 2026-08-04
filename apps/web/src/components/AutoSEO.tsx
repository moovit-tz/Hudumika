import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { APP_LABELS } from '../shells/WorkspaceApp.js';
import { useBranding } from '../hooks/useBranding.js';
import { fallbackSEO, titleFromPath } from '../lib/seo.js';
import type { AppId } from '@hudumika/types';

/**
 * Gives every route a title without the page doing anything.
 *
 * 233 of 244 pages set none, so all 379 routes shared one tab title and one
 * bookmark name. Rather than annotate every page — which the next page added
 * would immediately fall out of — this derives one from the route and the app
 * it belongs to: /nexushr/employment becomes "Employment · NexusHR".
 *
 * The app name comes from the same branding lookup the sidebar uses, so a
 * tenant that renames an app gets that name in the tab too. A page wanting
 * something better calls usePageSEO and this defers to it.
 *
 * Mounted once inside the router. New routes are covered the moment they exist.
 */
export function AutoSEO() {
  const { pathname } = useLocation();
  const branding = useBranding();

  useEffect(() => {
    const appSegment = pathname.split('/').filter(Boolean)[0] as AppId | undefined;
    const known = appSegment && appSegment in APP_LABELS;
    const appName = known
      ? branding.getAppName(appSegment as AppId, APP_LABELS[appSegment as AppId])
      : null;

    const pageName = titleFromPath(pathname);

    // An app's own index route reads as just the app, not "Nexushr · NexusHR".
    const title = !pageName
      ? (appName ?? '')
      : appName && pageName.toLowerCase() === appName.toLowerCase()
        ? appName
        : appName
          ? `${pageName} · ${appName}`
          : pageName;

    fallbackSEO(pathname, title);
  }, [pathname, branding]);

  return null;
}
