// StandalonePos.tsx — POS's own standalone entry point (Phase 1 of the
// "Hudumika Commerce" scope: give POS a real appId/route/subdomain
// identity, same treatment ClearOS/HuduFreight/CargoTracker got via
// migrations 685/687/689, here migration 709). Deliberately reuses
// FinancePos.tsx as-is — no duplicated checkout/register/payment logic —
// this file only supplies the standalone chrome (its own WorkspaceApp
// appId, no Finance sidebar/nav) around the exact same page FinOpsShell
// still renders at /finance/pos for a bundled tenant.
import { WorkspaceApp } from '../shells/WorkspaceApp.js';
import { RequireRoles } from '../components/RequireRoles.js';
import { FinanceCapabilityGate } from '../components/FinanceCapabilityGate.js';
import { FIN_ROLES } from '../lib/permissions.js';
import { FinancePos } from './FinancePos.js';
import './FinOps.css';

export function StandalonePos() {
  return (
    <WorkspaceApp appId="pos">
      <div className="fin-pos-workspace" data-finops="true">
        <FinanceCapabilityGate capability="finance.pos">
          <RequireRoles roles={FIN_ROLES}>
            <FinancePos />
          </RequireRoles>
        </FinanceCapabilityGate>
      </div>
    </WorkspaceApp>
  );
}
