# Hudumika product design principles

**Status:** Working standard for every Hudumika product and team  
**Audience:** Product, design, engineering, content, support, security, operations, sales, and implementation teams  
**Purpose:** Give every Hudumika product a coherent, trustworthy experience while allowing domain-specific workflows to work the way their users need.

This is Hudumika's own standard. It takes inspiration from public design-system practices—including Uber's emphasis on a unified system, user-focused content, consistent voice with situational tone, clear marketplace information, and responsible creative policy—without copying Uber's identity, interface, wording, or proprietary assets. The current implementation contract lives in [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md); the live React components and tokens live in `apps/web/src/components/ui/`, `apps/web/src/index.css`, and `apps/web/src/hooks/useDesignSystem.ts`.

## 1. Hudumika's product promise

Hudumika helps organizations coordinate work, money, people, records, and services across connected products. A user should be able to understand what is happening, what it means, and what they can safely do next—whether they are on a phone in the field or at a desk reviewing an organization-wide report.

Every product must:

1. **Make the next useful action clear.** Put the user's task and its current state before internal terminology or product promotion.
2. **Make important facts dependable.** Amounts, statuses, permissions, owners, timestamps, and operational outcomes must come from real system state. Label estimates, stale information, missing integrations, and unavailable data.
3. **Preserve context across products.** Shared identity, tenant, people, contacts, notifications, audit history, and finance must behave consistently while each product keeps its specialist workflow.
4. **Respect the consequences of work.** Financial, legal, safety, HR, customs, and customer-facing actions need appropriate validation, permissions, traceability, and recovery.
5. **Work under real conditions.** Support small screens, slow or intermittent connections, keyboard use, assistive technology, localization, and interrupted work.

## 2. Principles for product decisions

Use these principles in order when choices conflict. Record the trade-off when a product has to depart from them.

### People before internal structure

Start with a real user, their role, their goal, and the situation in which they work. Design for the customer, employee, driver, agent, manager, accountant, administrator, and external partner who actually uses the flow—not for an org chart or database schema. Avoid exposing Hudumika's internal app boundaries when a task crosses them.

### Clear before clever

Use familiar words, visible labels, and explicit states. Prefer a readable text label beside an icon when a user must make a consequential choice. Use progressive disclosure to keep routine work calm while keeping advanced controls findable. Never make an icon, color, abbreviation, or hover state the only carrier of meaning.

### Trust through truth

Do not simulate a successful send, payment, sync, approval, verification, or delivery. Tell users whether an action is saved, queued, processing, completed, rejected, or unknown. Show the source and age of high-impact data, and give users a safe next step when it is stale or unavailable.

### One system, useful variation

Shared navigation, controls, typography, spacing, focus, feedback, and responsive behavior come from the Hudumika design system. Product-specific variations are allowed when they solve a validated domain need; they must be expressed as reusable tokens, components, or documented patterns, with an owner and review date. Do not create a local copy of a shared component to get a one-screen visual change.

### Choice with guardrails

Give users options when they have real, informed choices. Explain material effects before actions that spend money, expose data, contact customers, change access, submit to a regulator, or cannot be undone. Safe defaults should reduce setup and protect the tenant; they must not conceal a material trade-off.

### Reliability is part of the interface

Design loading, empty, partial, offline, denied, stale, conflict, and error states as first-class states. Keep user-entered work recoverable. Use idempotency and clear progress for actions that can be retried. Never imply a downstream system accepted an action until the system confirms it.

### Privacy and least access by default

Show each person only the information needed for their work and role. Scope tenant data and cross-product access server-side. Do not rely on hidden UI controls as authorization. Treat search, exports, notifications, logs, analytics, and AI context as data-access surfaces too.

### Accessibility and inclusion are baseline quality

Build for keyboard and screen-reader use, sufficient contrast, visible focus, understandable validation, reduced motion, touch targets, zoom, and narrow viewports. Do not encode status by color alone. Content should work across local languages and formats without assuming every user has the same role, literacy, device, connectivity, or working hours.

## 3. Hudumika visual language

The exact values and component behavior are owned by the runtime design system; these principles explain how teams should use them.

- **Brand:** Hudumika is the platform identity. Each app may have its configured accent, logo, and name, but must retain shared interaction and accessibility behavior. Do not borrow Uber marks, colors as a brand system, illustrations, or proprietary components.
- **Color:** Use semantic tokens for meaning and app accents for identity. Color must not be the only way to distinguish status or priority. Filled actions must use the contrast-safe primary pair; raw tenant accents are not guaranteed to be accessible as a background.
- **Shape and density:** Use the global shape, density, and control-height tokens. Do not hardcode radii or dimensions in page styles. Compact density may reduce visual bulk but must preserve readable text and usable targets.
- **Typography:** Use the configured type family and shared hierarchy. Keep page titles, section headings, labels, body text, and metadata distinct. Avoid long all-caps labels and dense paragraphs in operational screens.
- **Icons:** Use the shared icon library and consistent stroke/size rules. Pair icons with text for unfamiliar or high-consequence actions. Icon-only actions require an accessible name and a tooltip or equivalent visible hint.
- **Surfaces:** Use cards to group related information and support a task, not as decoration around every field. Align card padding and actions; keep critical actions visible without horizontal page scrolling.
- **Motion:** Motion should explain state changes and preserve orientation. Respect reduced-motion preferences. Never use animation to hide delays, imply false completion, or distract from urgent information.

### Responsive behavior

Design from the narrow viewport upward. On mobile, preserve task order, labels, values, and primary actions; reflow grids and detail panels; make tables use an intentional compact/card or local-scroll pattern; and keep destructive actions distinct. Do not solve overflow by shrinking text until it is unreadable or by making the entire page scroll sideways. Validate at minimum 320px, 375px, tablet, and desktop widths, plus 200% zoom.

## 4. Product voice and content

### Voice

Hudumika sounds **clear, capable, considerate, and candid**. The voice is consistent; tone changes with the user's moment.

| Attribute | Hudumika expression | Avoid |
| --- | --- | --- |
| Clear | Familiar words, short sentences, concrete actions | Internal jargon, vague system language |
| Capable | Accurate guidance and confident explanations | Arrogance, unsupported certainty |
| Considerate | Respectful, calm, non-blaming help | Forced friendliness, scolding, jokes during harm |
| Candid | State what happened, what did not, and what is unknown | Fake success, hidden limits, promises without evidence |

### Tone by situation

| Moment | Tone | Content rule |
| --- | --- | --- |
| Routine work | Brief and neutral | Lead with the task or result; omit filler. |
| Success | Calm and specific | Say what completed and what happens next, if anything. |
| Validation | Helpful and local | Explain the field requirement beside the field. |
| Technical issue | Steady and candid | Name the affected action, explain recovery, and state whether data was saved. |
| Risk, fraud, safety, or compliance | Serious and precise | Separate facts from signals; avoid accusation and sensational language. |
| Money or irreversible action | Explicit and complete | State amount, currency, recipient, timing, and consequence before confirmation. |
| Sensitive HR or identity action | Private and respectful | Minimize exposure and avoid unnecessary detail in notifications. |

### Writing rules

- Put the key fact first. Use one action per button and start labels with a verb when practical: **Save changes**, **Review invoice**, **Invite member**.
- Use specific errors and a path forward. Example: “Couldn’t save the invoice. Your changes are still here. Try again.” Do not say “Something went wrong” when a more useful explanation is known.
- Never blame the user. Explain the constraint or missing information without implying fault.
- Keep titles short and descriptive. Do not shorten words into chat slang. Define specialist terms at first use when the audience may not know them.
- Use consistent names for the same entity and action across the platform. A glossary belongs to the product, not to each team's memory.
- Format dates, time zones, phone numbers, currencies, and large figures according to locale and user context. Make the time zone clear when deadlines or events cross regions.
- Disclose estimates, generated content, AI assistance, and uncertain matches. Users must be able to verify and correct consequential AI output.
- Avoid emoji, excessive punctuation, all-caps emphasis, promotional claims in task flows, and language that implies an external endorsement.

### Message pattern

For a blocking issue, use:

1. **What happened:** one concrete sentence.
2. **Impact:** whether the action or data was saved, sent, charged, or left unchanged.
3. **Next step:** a safe action such as retry, review, edit, contact an administrator, or open support.

For non-blocking notices, use a concise status and do not force acknowledgment.

## 5. Domain patterns for Hudumika products

Shared principles apply everywhere; domain rules add the context needed to prevent harmful ambiguity.

| Product area | Must make clear | Design guardrail |
| --- | --- | --- |
| Finance, Petti, accounting, tax | Currency, period, source ledger, reconciliation state, approval, and whether a figure is posted or estimated | Never let compact display replace the exact value in details, exports, or audit records. Separate draft, submitted, approved, posted, and paid. |
| ClearOS, customs, compliance | Jurisdiction, declaration/reference, source and freshness of rules, deadlines, fees, and evidence | Do not present guidance as an official determination. Surface missing evidence and the responsible reviewer. |
| Freight, Tuma, Seal, tracking | Shipment/task identity, owner, event time and time zone, physical/virtual state, custody, and exceptions | Preserve a traceable event history; distinguish a device-reported event from a human-confirmed event. |
| NexusHR, payroll, attendance | Person, effective date, policy, approval state, privacy scope, and correction history | Keep sensitive records role-scoped; explain calculation assumptions and require review of exceptions. |
| CRM and customer operations | Customer/lead identity, relationship, owner, next action, consent, and contact history | Avoid duplicate identities and make data provenance and consent visible before outreach. |
| Bliss and support | Customer impact, severity, first response, ownership, escalation, resolution, and feedback | Measure both speed and quality; do not incentivize unsafe closure or manipulate ratings. |
| Ondi identity and access | Account, tenant, role, session, factor, application, and trust boundary | Explain which organization is being accessed; make recovery and session termination discoverable. |
| Zentra risk and oversight | Signal source, evidence, confidence, scope, policy, and review/appeal path | A risk signal is not proof. Do not expose sensitive monitoring beyond authorized reviewers or make unreviewed automated adverse decisions. |

Product teams may extend this table through a reviewed design decision. Product-specific extensions may add rules; they may not weaken tenant isolation, access control, auditability, accessibility, or truthful status reporting.

## 6. Platform and product architecture

- **Hudumika core:** shared identity, tenancy, entitlements, design language, API contracts, audit events, notification preferences, and accessibility behavior.
- **Products:** own domain workflows and data semantics. A specialist app may have its own interface or operate independently, but must use documented Ondi identity and authorized APIs for shared services.
- **Product identity:** app name, accent, icon, and slogan are configuration. Do not fork the shared header, sidebar, identity, or control behavior to brand an app.
- **Shared services:** contacts, email, SMS, tasks, finance, HR, documents, and compliance should expose stable permission-aware APIs. A product may not read another product's tables directly as an integration shortcut.
- **Events and integrations:** define event ownership, schema version, idempotency key, tenant scope, delivery semantics, retry behavior, and audit requirements. Show users whether a cross-product action is queued, accepted, or confirmed.
- **Entitlements:** UI visibility improves discovery; backend entitlement checks enforce access. A locked feature must explain its value and route to an authorized upgrade path without pretending a disabled capability is active.

## 7. Team responsibilities and review gates

| Team | Owns | Required review question |
| --- | --- | --- |
| Product | User problem, outcome, scope, measures, and trade-offs | Which user task improves, and how will we know? |
| Design | Flow, hierarchy, content, accessibility, responsive behavior, and system reuse | Can a new user understand the state and next action without coaching? |
| Engineering | Correct state, API contracts, tenant isolation, performance, resilience, and semantics | Is the displayed outcome true, permission-checked, recoverable, and observable? |
| Content | Names, instructions, localization, error/help copy, and glossary | Is this clear in the user's context and free of hidden assumptions? |
| Security and privacy | Data classification, access, retention, consent, threat model, and auditability | Could this expose or infer information beyond the user's legitimate need? |
| Operations and support | Runbooks, escalation, service health, and customer recovery | What does a user or support agent do when this is delayed or unavailable? |
| Marketing and communications | Positioning, claims, campaign assets, and channel fit | Is the claim substantiated, accessible, locally appropriate, and clearly Hudumika-owned? |

### Definition of ready

Before implementation, the proposal identifies target users and roles, task/job, success measure, mobile and low-connectivity conditions, permissions/data sensitivity, error and empty states, integrations and source of truth, and localization needs.

### Definition of done

Before release, the team verifies:

- Shared components and tokens are used; any exception is documented and reviewed.
- Loading, empty, partial, success, validation, permission-denied, offline/stale, and failure states are implemented where relevant.
- Keyboard, screen-reader labels, visible focus, contrast, reduced motion, touch targets, zoom, and small viewport behavior are checked.
- Tenant-scoped access is enforced on the server and tested with a cross-tenant negative case for sensitive data.
- High-impact actions have clear confirmation, idempotency/retry behavior, audit history, and a recovery path.
- Copy, dates, time zones, units, currency, precision, and data provenance are correct.
- Analytics measure task outcomes and quality without collecting unnecessary personal data.
- Product, design, engineering, content, security/privacy, and operational owners approve the release proportional to its risk.

## 8. How to extend the system

1. Search the component catalog and existing code before creating a pattern.
2. State the user problem and why an existing token/component cannot solve it.
3. Design the smallest reusable extension, including all interaction and failure states.
4. Check accessibility, responsive layout, localization, tenant theming, density, and dark mode.
5. Implement in the shared system if two or more products need it; otherwise keep a domain component composed from shared primitives.
6. Add the rule to `docs/DESIGN_SYSTEM.md` and the relevant product guidance. Document the owner and review date for exceptions.
7. Add or update automated checks for stable contracts; verify visually at representative sizes and themes.
8. Remove replaced patterns and migrate callers in manageable, reviewable increments.

Never fork a shared primitive just to ship faster. If the shared system cannot support a real need, improve the shared abstraction without imposing unrelated behavior on current users.

## 9. Measures that keep the standard honest

Track evidence, not taste alone:

- task completion and time to complete critical workflows;
- errors, retries, duplicate actions, abandoned flows, and support contacts;
- accessibility defects and keyboard/screen-reader task completion;
- mobile overflow and layout regressions;
- stale, missing, or conflicting data encountered by users;
- permission denials, cross-tenant access tests, and privacy incidents;
- adoption of shared components and count/age of documented exceptions;
- user confidence and comprehension for consequential actions.

Do not optimize a single speed metric if it encourages rushed approvals, shallow support resolution, fraud, unsafe operations, or hidden work shifted to another team.

## 10. Source inspiration and adaptation

The sources below inform this standard; Hudumika's rules above are original adaptations for a multi-tenant ERP and connected specialist products. Public Base pages may change or require account access. Advertising-specific restrictions from Uber are not treated as product UI rules; only the general lessons of consistency, clarity, legibility, substantiated claims, and responsible content are adapted.

- [Uber Base design system overview](https://base.uber.com/) — a shared foundation for multiple products, with principles, design language, components, patterns, and extensions.
- [Uber Base product voice](https://base.uber.com/6d2425e9f/v/0/p/040a13-product-voice) and [Content guidance](https://base.uber.com/6d2425e9f/p/4245c4-content) — consistent voice, context-sensitive tone, and user-focused content.
- [Uber marketplace principles](https://www.uber.com/us/en/marketplace/principles/) — access, reliability, choice, aligned needs, and transparency as product decision inputs.
- [77 Things About Uber Design](https://medium.com/uber-design/77-things-about-uber-design-4621516e495c) — pattern recognition and deliberate system application across a design artifact.
- [Wolff Olins: Uber](https://wolffolins.com/work/uber) — brand architecture, verbal and visual identity, culture, and experience considered together.
- [Uber universal creative guidelines](https://www.uber.com/gb/en/advertising/specs/guidelines/) and [Global Advertising Content Policy](https://www.uber.com/global/en/legal/global-advertising-content-policy/) — channel consistency, legibility, claims, and responsible content; these remain Uber advertising policies, not Hudumika policies.
- [Uber advertising creative best practices](https://www.uber.com/iq/en/blog/creative-best-practices-the-rules-of-the-road-for-uber-advertising/) — context-aware experiences and consistency across surfaces.

