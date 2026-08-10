import React from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../../components/Icon.js';

/**
 * A capability Onsite does not have yet, said plainly.
 *
 * These screens shipped filled with values transcribed from a screenshot of
 * somebody's Hostinger account — a real server IP, a real SSH port, a real
 * hosting username, a real database name and size. They were static text
 * presented as this workspace's live infrastructure, which meant two things at
 * once: nothing on the page was true for whoever was reading it, and every
 * tenant on the platform was shown the operator's own production credentials.
 *
 * Onsite is a control plane (ONSITE.md §97): it reports what a provider tells
 * it. Where no provider is connected there is nothing to report, and saying so
 * is the honest screen. A page that invents a plausible answer is worse than a
 * page that admits it has none, because somebody will act on it.
 */
export function NotProvisioned({
  icon,
  title,
  what,
  needs,
}: {
  icon: IconName;
  /** The capability, named the way a person would ask for it. */
  title: string;
  /** What it will show once something is behind it. */
  what: string;
  /** What has to exist first, in plain terms. */
  needs: string;
}) {
  return (
    <div className="onsite-card onsite-unprovisioned">
      <div className="onsite-unprovisioned-icon">
        <Icon name={icon} size={22} color="var(--ink3)" />
      </div>
      <h3 className="onsite-unprovisioned-title">{title}</h3>
      <p className="onsite-unprovisioned-what">{what}</p>
      <p className="onsite-unprovisioned-needs">{needs}</p>
      <Link to="/onsite/settings" className="btn btn-secondary btn-sm">
        Provider connections
      </Link>
    </div>
  );
}
