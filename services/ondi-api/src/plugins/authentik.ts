import fp from 'fastify-plugin';

export interface AuthentikUserAttrs {
  ondi_trust_score?: number;
  ondi_trust_tier?: 'LOW' | 'MEDIUM' | 'HIGH';
  ondi_kyc_verified?: boolean;
  ondi_kyc_level?: string;
  ondi_risk_flags?: string[];
  ondi_contract_expiry?: string | null;
  ondi_employment_type?: string;
  ondi_employee_id?: string;
  ondi_org_id?: string;
}

export interface AuthentikClient {
  // Whether this instance actually holds real credentials — false means
  // every method below silently simulates success and touches nothing,
  // which the org-admin status surface (routes/org-security.ts's
  // /authentik-status) needs to say outright rather than implying the
  // integration is live when it isn't.
  isConnected: boolean;
  provisionUser: (user: { id: string; email: string | null; firstName: string | null; lastName: string | null; phoneNumber: string }, orgId?: string, department?: string, jobTitle?: string) => Promise<{ id: string } | null>;
  /** Native Authentik REST PATCH — plain partial fields (e.g. `{ is_active: false }`), not SCIM PatchOp syntax. */
  updateUser: (authentikUserId: string, fields: Record<string, unknown>) => Promise<boolean>;
  deprovisionUser: (authentikUserId: string) => Promise<boolean>;
  updateAttributes: (userPk: string, attributes: AuthentikUserAttrs) => Promise<boolean>;
  getUserPkByEmailOrEmployeeId: (email?: string, employeeId?: string) => Promise<string | null>;
  revokeSessions: (username: string, userPk: string) => Promise<boolean>;
}

export const authentikPlugin = fp(async (app) => {
  const baseUrl = process.env.AUTHENTIK_BASE_URL || 'http://localhost:9000';
  // A single token authenticates every call this plugin makes — all of it
  // is Authentik's native Admin API (/api/v3/core/...), not SCIM, so there
  // is no separate SCIM credential to configure. (AUTHENTIK_SCIM_TOKEN used
  // to gate this too, back when provisionUser/updateUser called a SCIM
  // endpoint that doesn't actually exist on a real instance — see
  // provisionUser's comment below.)
  const apiToken = process.env.AUTHENTIK_API_TOKEN || 'mock_api_token';

  const isMock = apiToken === 'mock_api_token';

  // A per-call warn log is easy to miss operationally — every provisioning,
  // deprovisioning, and attribute-sync call silently no-ops in mock mode,
  // which is materially different from those calls actually working. Refuse
  // to start this way in production; make it impossible to miss elsewhere.
  if (isMock) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[ondi-api] AUTHENTIK_API_TOKEN is unset. Refusing to start in production with directory ' +
        'provisioning silently mocked — every workforce provision/deprovision call would appear to ' +
        'succeed while doing nothing. Set it, or set NODE_ENV to something other than "production" ' +
        'if this is intentionally a non-prod deployment.',
      );
    }
    app.log.warn(
      '\n' + '━'.repeat(78) + '\n' +
      '  ⚠ AUTHENTIK PROVISIONING IS RUNNING IN MOCK MODE\n' +
      '  AUTHENTIK_API_TOKEN is unset — every provision, deprovision, and\n' +
      '  attribute-sync call below will simulate success and do nothing. This is\n' +
      '  fine for local dev, but this deployment is not actually wired to a real\n' +
      '  Authentik instance.\n' +
      '━'.repeat(78),
    );
  }

  const client: AuthentikClient = {
    isConnected: !isMock,
    // Provisioning here means "create this user in Authentik's own
    // directory" (Authentik as the destination), NOT SCIM. Authentik's SCIM
    // Provider is outbound-only — Authentik pushing ITS directory out to a
    // downstream SCIM-compliant app — it has no generic inbound SCIM server
    // endpoint for another system to push users into it. `POST
    // {baseUrl}/scim/v2/Users` (the previous implementation) 404s/405s
    // against a real instance; this was only ever exercised in mock mode.
    // getUserPkByEmailOrEmployeeId/updateAttributes/revokeSessions below
    // already used Authentik's real native Admin API
    // (/api/v3/core/users/...) — provisionUser/updateUser now match them.
    provisionUser: async (user, orgId, department, jobTitle) => {
      app.log.info({ userId: user.id }, 'Provisioning user in authentik');

      if (isMock) {
        app.log.warn('authentik is in mock mode — simulating user provisioned successfully');
        return { id: `mock_auth_user_${Date.now()}` };
      }

      const username = user.email || `${user.phoneNumber}@ondi.internal`;
      const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || username;

      try {
        const response = await fetch(`${baseUrl}/api/v3/core/users/`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            username,
            name,
            is_active: true,
            ...(user.email ? { email: user.email } : {}),
            attributes: {
              ondi_employee_id: user.id,
              ondi_org_id: orgId || null,
              ondi_department: department || null,
              ondi_job_title: jobTitle || null,
            },
          })
        });

        if (!response.ok) {
          // A prior attempt that provisioned the user but failed before
          // returning (network blip, timeout) leaves a real Authentik user
          // with no way to retry cleanly — username-uniqueness would 400
          // forever otherwise. Look them up instead of hard-failing.
          if (response.status === 400) {
            const existingPk = await client.getUserPkByEmailOrEmployeeId(user.email ?? undefined, user.id);
            if (existingPk) return { id: existingPk };
          }
          const errText = await response.text();
          app.log.error({ errText, status: response.status }, 'Failed to provision user in authentik');
          throw new Error(`Provisioning failed: ${response.statusText}`);
        }

        const data: any = await response.json();
        return { id: String(data.pk) };
      } catch (err: any) {
        app.log.error(err, 'authentik provisioning request error');
        throw err;
      }
    },

    /** Partial update via Authentik's native PATCH /api/v3/core/users/:pk/ — plain field names (e.g. `{ is_active: false }`), not SCIM PatchOp syntax. */
    updateUser: async (authentikUserId, fields) => {
      app.log.info({ authentikUserId, fields }, 'Updating user in authentik');

      if (isMock) {
        app.log.warn('authentik is in mock mode — simulating user updated successfully');
        return true;
      }

      try {
        const response = await fetch(`${baseUrl}/api/v3/core/users/${authentikUserId}/`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(fields)
        });

        if (!response.ok) {
          const errText = await response.text();
          app.log.error({ errText, status: response.status }, 'Failed to update user in authentik');
          return false;
        }

        return true;
      } catch (err: any) {
        app.log.error(err, 'authentik update request error');
        return false;
      }
    },

    deprovisionUser: async (authentikUserId) => {
      app.log.info({ authentikUserId }, 'Deprovisioning user (active=false) in authentik');
      return client.updateUser(authentikUserId, { is_active: false });
    },

    updateAttributes: async (userPk, attributes) => {
      app.log.info({ userPk, attributes }, 'Syncing custom attributes to authentik');

      if (isMock) {
        app.log.warn('authentik is in mock mode — simulating attributes synced successfully');
        return true;
      }

      try {
        const response = await fetch(`${baseUrl}/api/v3/core/users/${userPk}/`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ attributes })
        });

        if (!response.ok) {
          const errText = await response.text();
          app.log.error({ errText, status: response.status }, 'Failed to update authentik user attributes');
          return false;
        }

        return true;
      } catch (err: any) {
        app.log.error(err, 'authentik PATCH attributes error');
        return false;
      }
    },

    getUserPkByEmailOrEmployeeId: async (email, employeeId) => {
      app.log.info({ email, employeeId }, 'Querying authentik for user PK');

      if (isMock) {
        app.log.warn('authentik is in mock mode — returning simulated user PK');
        return `mock_pk_${Date.now()}`;
      }

      try {
        let url = `${baseUrl}/api/v3/core/users/`;
        if (email) {
          url += `?email=${encodeURIComponent(email)}`;
        } else if (employeeId) {
          url += `?attributes=${encodeURIComponent(JSON.stringify({ ondi_employee_id: employeeId }))}`;
        } else {
          return null;
        }

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          app.log.error({ status: response.status }, 'Failed to query user PK in authentik');
          return null;
        }

        const data: any = await response.json();
        if (data.results && data.results.length > 0) {
          return data.results[0].pk;
        }

        return null;
      } catch (err: any) {
        app.log.error(err, 'authentik GET user PK error');
        return null;
      }
    },

    revokeSessions: async (username, userPk) => {
      app.log.info({ username, userPk }, 'Enforcing session revocation and account deactivation in authentik');

      if (isMock) {
        app.log.warn('authentik is in mock mode — simulating session revocation successfully');
        return true;
      }

      try {
        // Step 1: Get all active sessions for this user
        const sessionsUrl = `${baseUrl}/api/v3/core/authenticated_sessions/?user_username=${encodeURIComponent(username)}`;
        const response = await fetch(sessionsUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          app.log.error({ status: response.status }, 'Failed to retrieve user sessions from authentik');
          throw new Error('Failed to retrieve user sessions');
        }

        const sessionData: any = await response.json();
        const sessions = sessionData.results || [];

        // Step 2: Delete each session sequentially
        for (const session of sessions) {
          const deleteUrl = `${baseUrl}/api/v3/core/authenticated_sessions/${session.uuid}/`;
          const delRes = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${apiToken}`
            }
          });

          if (!delRes.ok) {
            app.log.warn({ uuid: session.uuid, status: delRes.status }, 'Failed to revoke specific session');
          }
        }

        // Step 3: Deactivate core user account (prevents future logins)
        const deactivateUrl = `${baseUrl}/api/v3/core/users/${userPk}/`;
        const deactRes = await fetch(deactivateUrl, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ is_active: false })
        });

        if (!deactRes.ok) {
          app.log.error({ status: deactRes.status }, 'Failed to deactivate user in authentik core');
          return false;
        }

        return true;
      } catch (err: any) {
        app.log.error(err, 'Error revoking authentik sessions');
        return false;
      }
    }
  };

  app.decorate('authentik', client);
});

declare module 'fastify' {
  interface FastifyInstance {
    authentik: AuthentikClient;
  }
}
