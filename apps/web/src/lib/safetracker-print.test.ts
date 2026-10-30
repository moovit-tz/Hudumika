import { expect, it } from 'vitest';
import { escapePrintData } from './print-data.js';
import { getContainerDetails } from '../components/container/containerData.js';
it('escapes markup in nested provider, customer and survey fields before print interpolation',()=>{
 const attack='"><img src=x onerror=alert(1)><script>alert(1)</script>';
 const row=escapePrintData({events:[{description:attack}],company:{name:attack},notes:attack});
 expect(row.events[0].description).not.toContain('<');expect(row.company.name).not.toContain('"');expect(row.notes).toContain('&lt;script&gt;');
});
it('never supplies certifications, repairs, customers or voyages for unknown equipment',()=>{
 for(const number of ['MSCU1234567','TGHU1234567','XXXX0000000']){
  const record=getContainerDetails(number);expect(record.survey_report.grade).toBe('');expect(record.survey_report.repairs).toEqual([]);expect(record.classification.certifications).toEqual([]);expect(record.voyage.vessel_name).toBe('');expect(record.compliance.csc_cert_date).toBe('');expect(record.customer.name).toBe('');expect(record.timeline).toEqual([]);
 }
});
