import PDFDocument from 'pdfkit';
import { sanitizeDocumentHtml } from './sign-rich-document.service.js';
import { z } from 'zod';
import { documentFonts, applyDocumentFonts } from './document-branding.service.js';
import { ALL_APP_IDS, expandSignDocument, type AppId, type SignDocumentDefinition, type SignDocumentLanguage } from '@hudumika/types';
import { additionalDocumentStarters, type CatalogueStarter } from './sign-document-catalogue.js';
import { draftedDefinition } from './sign-document-drafting.js';
import { readFile } from 'node:fs/promises';

export const documentDefinitionSchema: z.ZodType<SignDocumentDefinition, z.ZodTypeDef, unknown> = z.object({
  editor_html: z.string().max(5000000).transform(sanitizeDocumentHtml).optional(),
  language: z.enum(['en','sw','zh']).optional(),
  translations: z.object({en:z.object({body:z.string().min(1).max(100000)}).optional(),sw:z.object({body:z.string().min(1).max(100000)}).optional(),zh:z.object({body:z.string().min(1).max(100000)}).optional()}).optional(),
  jurisdiction_clauses: z.record(z.object({en:z.string().max(10000),sw:z.string().max(10000),zh:z.string().max(10000)})).optional(),
  jurisdiction_guidance: z.array(z.object({jurisdiction:z.string(),notes:z.object({en:z.string(),sw:z.string(),zh:z.string()}),sources:z.array(z.object({title:z.string(),url:z.string().url()}))})).optional(),
  apps: z.array(z.string().refine((id): id is AppId => ALL_APP_IDS.includes(id as AppId), 'Unknown Hudumika app')).max(40).optional(),
  document_type: z.enum(['agreement', 'letter', 'policy', 'record', 'form']).optional(),
  category: z.string().trim().min(1).max(80),
  jurisdictions: z.array(z.string().trim().min(1).max(120)).max(50),
  body: z.string().trim().min(1).max(100000),
  questions: z.array(z.object({
    key: z.string().regex(/^[a-z][a-z0-9_]*$/).max(80),
    label: z.string().trim().min(1).max(150),
    type: z.enum(['text', 'textarea', 'date', 'email', 'number','select']),
    required: z.boolean(),
    labels: z.object({en:z.string(),sw:z.string(),zh:z.string()}).partial().optional(),
    options: z.array(z.object({value:z.string(),labels:z.object({en:z.string(),sw:z.string(),zh:z.string()})})).max(30).optional(),
  })).max(100),
}).superRefine((definition, ctx) => {
  const keys = definition.questions.map(question => question.key);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', message: 'Question keys must be unique' });
  for (const question of definition.questions) {
    if (question.type === 'select' && !question.options?.length) ctx.addIssue({code:'custom',message:`Missing options for ${question.key}`});
  }
  for (const body of [definition.body,...Object.values(definition.translations || {}).map(value=>value.body)]) for (const match of body.matchAll(/\{\{([a-z][a-z0-9_]*)\}\}/g)) {
    if (!['jurisdiction','jurisdiction_terms'].includes(match[1]) && !keys.includes(match[1])) ctx.addIssue({ code: 'custom', message: `Missing question for ${match[1]}` });
    if (match[1] === 'jurisdiction_terms' && !Object.keys(definition.jurisdiction_clauses || {}).length) ctx.addIssue({code:'custom',message:'Missing jurisdiction clauses'});
  }
});

export function renderDocument(definition: SignDocumentDefinition, answers: Record<string, string>, jurisdiction: string, language: SignDocumentLanguage = definition.language || 'en') {
  if (definition.jurisdictions.length && !definition.jurisdictions.includes(jurisdiction)) throw new Error('Choose one of this template’s supported jurisdictions');
  if (definition.jurisdiction_clauses && !definition.jurisdiction_clauses[jurisdiction]) throw new Error('Choose one of this template’s supported jurisdictions');
  if (answers.authority_start === 'condition' && !answers.authority_condition?.trim()) throw new Error('Specify the condition that starts the authority');
  for (const q of definition.questions) {
    const value = answers[q.key]?.trim();
    if (q.required && !value) throw new Error(`${q.label} is required`);
    if (value && q.type === 'email' && !z.string().email().safeParse(value).success) throw new Error(`${q.label} must be a valid email`);
    if (value && q.type === 'number' && !Number.isFinite(Number(value))) throw new Error(`${q.label} must be a number`);
    if (value && ['notice_days','cure_days'].includes(q.key) && (Number(value)<0 || Number(value)>3650 || !Number.isInteger(Number(value)))) throw new Error(`${q.label} must be a whole number between 0 and 3650`);
    if (value && q.key==='confidentiality_years' && (Number(value)<=0 || Number(value)>100)) throw new Error('Confidentiality period must be greater than zero and at most 100 years');
    if (value && q.type === 'select' && !q.options?.some(option=>option.value===value)) throw new Error(`${q.label} must be one of the offered options`);
    if (value && q.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))) throw new Error(`${q.label} must be a valid date`);
  }
  return expandSignDocument(definition,answers,jurisdiction,language);
}

export async function buildDocumentPdf(title: string, body: string): Promise<Buffer> {
  const cjk = /[\u3400-\u9fff]/.test(title + body);
  const fonts = cjk ? await readFile(new URL('../assets/fonts/NotoSansCJKsc-Regular.otf',import.meta.url)).then(font=>({regular:font,bold:font})) : await documentFonts('atlassian-sans');
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margins: { top: 54, bottom: 54, left: 54, right: 54 }, info: { Title: title } });
    const chunks: Buffer[] = [];
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    applyDocumentFonts(pdf, { layout: 'classic', accent: '#000000', logo: null, fonts });
    pdf.font('Document-Bold').fontSize(20).text(title);
    pdf.moveDown().font('Document-Regular').fontSize(11).text(body, { lineGap: 5 });
    pdf.end();
  });
}

const starters = [
  { id: 'starter-service', name: 'Service agreement', category: 'Business & services', body: `PARTIES
{{provider}} and {{customer}} agree to the following proposed service terms.

1. SERVICES
{{services}}

2. TERM
The services begin on {{start_date}} and continue until {{end_date}}.

3. FEES AND PAYMENT
{{payment_terms}}

4. RESPONSIBILITIES
{{responsibilities}}

5. ENDING THE AGREEMENT
{{termination_terms}}

6. GOVERNING JURISDICTION
{{jurisdiction}}

7. ADDITIONAL TERMS
{{additional_terms}}

SIGNATURES
Provider: __________________ Date: __________
Customer: _________________ Date: __________` },
  { id: 'starter-confidentiality', name: 'Confidentiality agreement', category: 'Confidentiality & IP', body: `PARTIES
{{disclosing_party}} and {{receiving_party}}.

PURPOSE
{{purpose}}

CONFIDENTIAL INFORMATION
{{confidential_information}}

PERMITTED USE AND DISCLOSURE
{{permitted_use}}

EXCLUSIONS
{{exclusions}}

DURATION AND RETURN OF INFORMATION
{{duration_and_return}}

GOVERNING JURISDICTION
{{jurisdiction}}

ADDITIONAL TERMS
{{additional_terms}}

SIGNATURES
Disclosing party: ___________ Date: __________
Receiving party: ___________ Date: __________` },
  { id: 'starter-offer', name: 'Employment offer letter', category: 'Employment & HR', body: `Dear {{candidate}},

{{company}} proposes the following offer of employment.

ROLE AND LOCATION
{{role_and_location}}

START DATE
{{start_date}}

COMPENSATION AND BENEFITS
{{compensation}}

WORKING ARRANGEMENTS
{{working_arrangements}}

CONDITIONS OF THIS OFFER
{{offer_conditions}}

GOVERNING JURISDICTION
{{jurisdiction}}

ACCEPTANCE
{{acceptance_details}}

For the company: ___________ Date: __________
Candidate: ________________ Date: __________` },
  { id: 'starter-purchase', name: 'Purchase order', category: 'Sales & procurement', body: `BUYER
{{buyer}}

SUPPLIER
{{supplier}}

ORDER REFERENCE
{{order_reference}}

GOODS OR SERVICES
{{items_and_quantities}}

PRICING AND TAXES
{{pricing}}

DELIVERY
{{delivery_details}}

PAYMENT TERMS
{{payment_terms}}

GOVERNING JURISDICTION
{{jurisdiction}}

ADDITIONAL TERMS
{{additional_terms}}

Authorised by: _____________ Date: __________` },
  { id: 'starter-minutes', name: 'Board meeting minutes', category: 'Corporate governance', body: `COMPANY
{{company}}

MEETING
{{meeting_date}} at {{meeting_location}}

ATTENDEES AND APOLOGIES
{{attendees}}

CHAIR AND QUORUM
{{chair_and_quorum}}

AGENDA AND DISCUSSION
{{discussion}}

RESOLUTIONS
{{resolutions}}

ACTIONS AND RESPONSIBILITIES
{{actions}}

JURISDICTION
{{jurisdiction}}

APPROVAL
Chair: ____________________ Date: __________` },
  { id: 'starter-demand', name: 'Payment request letter', category: 'Finance & payments', body: `FROM
{{sender}}

TO
{{recipient}}

DATE
{{letter_date}}

REFERENCE
{{reference}}

Dear {{recipient}},

We request payment of {{amount_and_currency}} in relation to {{payment_reason}}.

PAYMENT DETAILS
{{payment_instructions}}

REQUESTED PAYMENT DATE
{{payment_date}}

Please contact {{contact_details}} if you need to discuss this request.

JURISDICTION
{{jurisdiction}}

Yours sincerely,
{{sender}}` },
];

// Original drafting outlines, not licensed LawDepot documents or jurisdiction-vetted contracts.
const originalApps: Record<string, AppId[]> = {
  'starter-service': ['workspace', 'crm', 'projects', 'sign'],
  'starter-confidentiality': ['workspace', 'crm', 'nexushr', 'sign'],
  'starter-offer': ['nexushr', 'workspace'],
  'starter-purchase': ['store', 'finops', 'seal'],
  'starter-minutes': ['workspace', 'complyos', 'sign'],
  'starter-demand': ['finops', 'crm'],
};
export const documentStarters: CatalogueStarter[] = [...starters.map(starter => ({
  ...starter,
  description: 'Prewritten clauses with a short factual questionnaire. Available in English, Kiswahili and Simplified Chinese.',
  document_definition: {
    apps: originalApps[starter.id],
    document_type: (starter.id === 'starter-offer' || starter.id === 'starter-demand' ? 'letter' : starter.id === 'starter-minutes' ? 'record' : starter.id === 'starter-purchase' ? 'form' : 'agreement') as 'agreement' | 'letter' | 'record' | 'form',
    category: starter.category,
    jurisdictions: [],
    ...draftedDefinition(starter.name, starter.id === 'starter-offer' || starter.id === 'starter-demand' ? 'letter' : starter.id === 'starter-minutes' ? 'record' : starter.id === 'starter-purchase' ? 'form' : 'agreement', starter.body.split('\n').map(line=>line.replace(/^\d+\.\s*/, '')).filter(line=>/^[A-Z0-9][A-Z &0-9.]+$/.test(line) && !['PARTIES','SIGNATURES','GOVERNING JURISDICTION','JURISDICTION','ADDITIONAL TERMS'].includes(line))),
  },
})), ...additionalDocumentStarters];
