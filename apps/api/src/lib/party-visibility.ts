import { sql, type RawBuilder } from 'kysely';

/**
 * The one definition of "may this user see this party" — used by /v1/parties
 * AND by Contacts (a contact is a person party with the same id), so a
 * PRIVATE contact is hidden everywhere, not just in the party directory.
 *
 * A party is visible when any of these holds:
 *   - visibility TENANT (everyone in the workspace)
 *   - the user owns it
 *   - a share names the user, a team they belong to (hr_team_members), or
 *     their department (users.department_id)
 *   - visibility TEAM and the owner shares an HR team with the user
 *   - visibility DEPARTMENT and the owner is in the user's department
 * EXPLICIT_SHARE is visible only through a share (or to the owner).
 *
 * The expression references the `parties` table by name, so use it inside a
 * subquery/select that has `parties` in FROM.
 */
export function partyVisibleSql(actor: { id: string; tenantId: string }): RawBuilder<boolean> {
  const uid = actor.id;
  const tid = actor.tenantId;
  return sql<boolean>`(
    parties.visibility = 'TENANT'
    OR parties.owner_user_id = ${uid}
    OR EXISTS (
      SELECT 1 FROM party_shares s
      WHERE s.tenant_id = ${tid} AND s.party_id = parties.id AND (
        (s.principal_type = 'USER' AND s.principal_id = ${uid})
        OR (s.principal_type = 'TEAM' AND s.principal_id IN (SELECT team_id FROM hr_team_members WHERE user_id = ${uid}))
        OR (s.principal_type = 'DEPARTMENT' AND s.principal_id IN (SELECT department_id FROM users WHERE id = ${uid} AND tenant_id = ${tid} AND department_id IS NOT NULL))
      )
    )
    OR (parties.visibility = 'TEAM' AND parties.owner_user_id IN (
      SELECT m2.user_id FROM hr_team_members m1 JOIN hr_team_members m2 ON m2.team_id = m1.team_id WHERE m1.user_id = ${uid}
    ))
    OR (parties.visibility = 'DEPARTMENT' AND parties.owner_user_id IN (
      SELECT u2.id FROM users u1 JOIN users u2 ON u2.department_id = u1.department_id AND u2.tenant_id = u1.tenant_id
      WHERE u1.id = ${uid} AND u1.tenant_id = ${tid} AND u1.department_id IS NOT NULL
    ))
  )`;
}

/** Set of party ids the actor may see, as a subquery for `WHERE contacts.party_id IN (...)`. */
export function visiblePartyIdsSql(actor: { id: string; tenantId: string }): RawBuilder<string> {
  return sql<string>`(SELECT parties.id FROM parties WHERE parties.tenant_id = ${actor.tenantId} AND ${partyVisibleSql(actor)})`;
}

/**
 * "May this user CHANGE this party" — a stricter cousin of partyVisibleSql.
 * Editable when any of these holds:
 *   - visibility TENANT (flat staff editing, same as Contacts has always had)
 *   - the user owns or created it
 *   - visibility TEAM / DEPARTMENT and the owner is a teammate / dept-mate
 *     (seeing it through the owner's group is what makes it "the team's")
 *   - a share with EDIT or MANAGE names the user, one of their teams, or their
 *     department. A VIEW share never grants edit, and a share on a TEAM party
 *     does not silently widen to the whole team.
 * Use inside a select that has `parties` in FROM, alongside partyVisibleSql.
 */
export function partyEditableSql(actor: { id: string; tenantId: string }): RawBuilder<boolean> {
  const uid = actor.id;
  const tid = actor.tenantId;
  return sql<boolean>`(
    parties.visibility = 'TENANT'
    OR parties.owner_user_id = ${uid}
    OR parties.created_by = ${uid}
    OR (parties.visibility = 'TEAM' AND parties.owner_user_id IN (
      SELECT m2.user_id FROM hr_team_members m1 JOIN hr_team_members m2 ON m2.team_id = m1.team_id WHERE m1.user_id = ${uid}
    ))
    OR (parties.visibility = 'DEPARTMENT' AND parties.owner_user_id IN (
      SELECT u2.id FROM users u1 JOIN users u2 ON u2.department_id = u1.department_id AND u2.tenant_id = u1.tenant_id
      WHERE u1.id = ${uid} AND u1.tenant_id = ${tid} AND u1.department_id IS NOT NULL
    ))
    OR EXISTS (
      SELECT 1 FROM party_shares s
      WHERE s.tenant_id = ${tid} AND s.party_id = parties.id AND s.permission IN ('EDIT', 'MANAGE') AND (
        (s.principal_type = 'USER' AND s.principal_id = ${uid})
        OR (s.principal_type = 'TEAM' AND s.principal_id IN (SELECT team_id FROM hr_team_members WHERE user_id = ${uid}))
        OR (s.principal_type = 'DEPARTMENT' AND s.principal_id IN (SELECT department_id FROM users WHERE id = ${uid} AND tenant_id = ${tid} AND department_id IS NOT NULL))
      )
    )
  )`;
}
