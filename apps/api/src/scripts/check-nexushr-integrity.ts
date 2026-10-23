import { sql } from 'kysely';
import { dbPlatform } from '../db/client.js';

// Platform connection is deliberate: this read-only deployment diagnostic reports
// aggregate integrity failures across tenants, never employee records or salaries.
async function main() {
  const constraints = await sql<{name:string;validated:boolean}>`
    select conname as name, convalidated as validated from pg_constraint
    where conrelid in ('hr_compensations'::regclass,'users'::regclass)
      and conname in ('hr_compensation_nonnegative_finite','hr_compensation_dates_valid',
        'hr_compensation_currency_valid','hr_compensation_frequency_valid','users_salary_nonnegative_finite')
  `.execute(dbPlatform);
  const overlapping = await sql<{count:string}>`
    select count(*)::text as count from hr_compensations a join hr_compensations b
      on a.tenant_id=b.tenant_id and a.user_id=b.user_id and a.id<b.id
      and daterange(a.effective_date,a.end_date,'[]') && daterange(b.effective_date,b.end_date,'[]')
  `.execute(dbPlatform);
  const journals = await sql<{paid_without_single_journal:string;unpaid_with_journal:string}>`
    with counts as (
      select r.id,r.status,count(j.id) as n from payroll_runs r
      left join journal_entries j on j.tenant_id=r.tenant_id and j.source_id=r.id
        and j.source_module='PAYROLL' and j.voided_at is null
      group by r.id,r.status
    ) select count(*) filter(where status='PAID' and n<>1)::text as paid_without_single_journal,
      count(*) filter(where status<>'PAID' and n>0)::text as unpaid_with_journal from counts
  `.execute(dbPlatform);
  const privacy=await sql<{outside:string;public_grants:string;envelopes:string}>`
    select
      (select count(*) from cloud_files f join cloud_drives d on d.id=f.drive_id and d.tenant_id=f.tenant_id where f.entity_type='employee' and d.managed_purpose is distinct from 'nexushr')::text as outside,
      (select count(*) from cloud_files f join cloud_drives d on d.id=f.drive_id and d.tenant_id=f.tenant_id where d.managed_purpose='nexushr' and (f.share_token is not null or exists(select 1 from cloud_file_shares s where s.file_id=f.id and s.tenant_id=f.tenant_id)))::text as public_grants,
      (select count(*) from sign_envelopes e join cloud_files f on f.id=e.file_id and f.tenant_id=e.tenant_id join cloud_drives d on d.id=f.drive_id and d.tenant_id=f.tenant_id left join users u on u.id=e.created_by and u.tenant_id=e.tenant_id
        where d.managed_purpose='nexushr' and coalesce(u.role,'') not in ('SUPER_ADMIN','ADMIN','TENANT_ADMIN')
          and not exists(select 1 from ondi_org_role_members m join ondi_org_roles r on r.id=m.role_id and r.tenant_id=m.tenant_id where m.tenant_id=e.tenant_id and m.user_id=e.created_by and (m.expires_at is null or m.expires_at>now()) and r.permissions::jsonb @> '["hr.documents.manage"]'::jsonb))::text as envelopes
  `.execute(dbPlatform);
  const result = {
    validatedConstraints:constraints.rows.filter(c=>c.validated).length,
    requiredConstraints:5,
    personnelFilesOutsideRestrictedDrive:Number(privacy.rows[0].outside),
    personnelFilesWithLegacyGrants:Number(privacy.rows[0].public_grants),
    personnelSigningEnvelopesNeedingReview:Number(privacy.rows[0].envelopes),
    overlappingCompensationPairs:Number(overlapping.rows[0].count),
    paidRunsWithoutSingleJournal:Number(journals.rows[0].paid_without_single_journal),
    unpaidRunsWithJournal:Number(journals.rows[0].unpaid_with_journal),
  };
  console.log(JSON.stringify(result,null,2));
  if (result.personnelFilesOutsideRestrictedDrive || result.personnelFilesWithLegacyGrants || result.personnelSigningEnvelopesNeedingReview || result.validatedConstraints !== 5 || result.overlappingCompensationPairs || result.paidRunsWithoutSingleJournal || result.unpaidRunsWithJournal) {
    console.error('Integrity review required. No records were modified; reconcile with the payroll owner before release.');
    process.exitCode=1;
  }
}

main().catch((error:unknown)=>{console.error(error instanceof Error ? error.message : 'Integrity check failed');process.exitCode=1;})
  .finally(async()=>{await dbPlatform.destroy();});
