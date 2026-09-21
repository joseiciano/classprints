# ClassPrints Frontend Redesign Handoff

**Status:** Approved design direction

**Approval date:** September 21, 2026

**Scope:** Frontend only

**Visual reference:** [`redesign-mockup.html`](./redesign-mockup.html)

## Purpose of this document

This document is the implementation source of truth for the approved ClassPrints frontend redesign. The HTML mockup remains the visual reference; this document records the decisions that are easy to lose in a static mockup: page ownership, theme tokens, responsive behavior, content direction, accessibility requirements, and backend boundaries.

The black **“ClassPrints · Redesign Mockup”** switcher at the top of the mockup is a preview control only. It must not appear in the production application.

If this document and the mockup appear to conflict:

1. Preserve existing backend contracts and route URLs.
2. Follow the behavioral requirements in this document.
3. Use the mockup for visual composition and tone.

## 1. Approved design direction

### Product positioning

ClassPrints is education-first. The interface speaks to teachers, educators, and authorized school staff managing classroom seating.

Use:

- students
- class rosters
- classrooms
- teachers and educators
- seating charts and arrangements
- classroom dynamics
- relationships, preferences, and constraints
- reusable class profiles

Avoid event-oriented terms such as guests, weddings, galas, dinner tables, or rivals.

### Visual concept

The visual direction is a warm, editorial “drafting desk” system:

- Warm paper surfaces rather than bright white or generic gray.
- Ink-like text with precise hairline borders.
- Deep pine green as the primary brand and action color.
- Terracotta for seating conflicts.
- Amber for pending or generating states.
- Red only for destructive actions and true failures.
- Characterful serif headings paired with a restrained sans-serif body.
- Monospace labels for statuses, coordinates, dates, counts, and metadata.
- Subtle texture and shadows; avoid glossy gradients or generic SaaS decoration.

The product should feel calm, capable, and built for professional classroom work—not childish and not corporate-enterprise heavy.

## 2. Application shells

### Public shell

Used by:

- landing page
- pricing
- sign-in and sign-up
- email verification and auth callback
- Terms of Service
- Privacy Policy
- customer service/support

Structure:

1. Full-width public header with an inner maximum width of `1120px`.
2. Main content.
3. Footer in normal document flow.

The public header contains the ClassPrints mark, relevant public links, theme toggle, and authentication CTA.

### Authenticated shell

Used by:

- charts list
- chart detail
- configs
- config arrangement
- new chart
- settings

Structure:

1. Left application sidebar on desktop.
2. Main workspace content.
3. No traditional page footer.

The sidebar contains the primary product navigation and ends with account identity, subscription tier, theme toggle, and access to supporting links such as Terms, Privacy, and Support. Sign out belongs in the account area, not as a primary navigation item.

Do not add a new authenticated Overview page as part of this redesign. The mockup’s Overview sidebar item is illustrative; the current product redirects authenticated `/` visits to `/charts`. The production sidebar should preserve the existing page set and begin with Charts.

### Footer behavior

The footer must not use `position: fixed` or overlay content.

Use a sticky-footer document layout:

```text
page: min-height: 100vh; display: flex; flex-direction: column
main: flex: 1
footer: normal document flow
```

Expected behavior:

- Short public pages: footer rests at the bottom of the viewport.
- Long public pages: footer follows the content.
- Authenticated workspace pages: no footer.

## 3. Route and page mapping

Preserve the existing route URLs.

| Route | Page concept | Access | Shell |
|---|---|---|---|
| `/` | Public overview/landing | Public; authenticated users may continue to `/charts` | Public |
| `/pricing` | Plans and billing options | Public | Public |
| `/sign-in` | Sign in | Public | Auth/public |
| `/sign-up` | Sign up | Public | Auth/public |
| `/verify-email` | Email verification | Public or signed-in-unverified | Auth/public |
| `/auth/callback` | Authentication callback | Public | Minimal auth |
| `/terms-of-service` | Terms of Service | Public | Public/legal |
| `/privacy-policy` | Privacy Policy | Public | Public/legal |
| `/customer-service` | Customer support | Public | Public |
| `/charts` | Seating chart list | Authenticated | App sidebar |
| `/charts/$jobId` | Chart job and generated results | Authenticated | App sidebar |
| `/create-arrangement` | New chart builder | Authenticated | App sidebar |
| `/configs` | Saved configs/class profiles | Authenticated | App sidebar |
| `/configs/arrangement` | Config-based arrangement builder | Authenticated | App sidebar |
| `/settings` | Account, subscription, and notifications | Authenticated | App sidebar |
| `/sign-out` | Sign-out flow | Authenticated | Minimal account flow |

Pricing, Terms, Privacy, and Customer Service must remain reachable while signed out. Route protection must be expressed through TanStack Router route boundaries or `beforeLoad`, not pathname string sets in a layout effect.

## 4. Navigation

### Public navigation

Desktop:

- ClassPrints mark and name on the left.
- Pricing, Sign in, theme toggle, and primary CTA on the right.
- Inner width: `1120px` maximum, `24px` horizontal padding, `100%` width.

Mobile:

- Brand remains visible.
- Collapse secondary links behind an accessible menu.
- Keep the primary action and theme control reachable.
- Opening the menu must trap focus; Escape closes it; focus returns to the trigger.

### Authenticated sidebar

Desktop width: `232px`.

Primary order:

1. Charts
2. Configs
3. New chart
4. Settings
5. Pricing

The account area stays at the bottom and includes:

- avatar/initials
- user identity
- plan label
- theme control
- Terms, Privacy, Support, and Sign out through either compact links or an account menu

On small screens, the sidebar becomes a drawer. It must not reduce the workspace to an unusably narrow column.

## 5. Theme behavior

Support light and dark themes throughout every page and state.

Production behavior:

- Store explicit user preference in `localStorage.theme` as `light` or `dark`.
- If no preference exists, use `prefers-color-scheme`.
- Apply dark mode to `document.documentElement` using the `dark` class.
- Keep the existing pre-render theme script, or equivalent, to prevent a flash of the wrong theme.
- Provide the theme toggle in the public header and authenticated sidebar/account area.
- A two-state visible toggle is sufficient; system preference remains the fallback when no explicit setting is stored.

Do not place raw color hex values in page components. Components consume semantic CSS variables or Tailwind theme tokens.

## 6. Color tokens

### Light theme

| Token | Value | Use |
|---|---:|---|
| `paper` | `#f6f3ec` | Page background |
| `paper-2` | `#efeadf` | Sidebar, recessed controls, secondary surfaces |
| `card` | `#fffdf8` | Cards, panels, menus |
| `ink` | `#201d18` | Primary text |
| `ink-2` | `#57534a` | Body-secondary text |
| `ink-3` | `#928c7e` | Metadata and placeholders |
| `line` | `#e2dccd` | Default border |
| `line-2` | `#d4cdba` | Stronger border and control outline |
| `pine` | `#2e5c49` | Primary action and positive state |
| `pine-soft` | `#e3ece7` | Selected/ready background |
| `pine-ink` | `#1d3f31` | Text on pale pine surfaces |
| `pine-hover` | `#1d3f31` | Primary hover |
| `pine-strong` | `#2e5c49` | Dark branded surfaces |
| `terra` | `#c25f3c` | Conflict state |
| `terra-soft` | `#f4e4dc` | Conflict background |
| `amber` | `#b98a2f` | Generating/pending state |
| `amber-soft` | `#f3ead6` | Pending background |
| `amber-ink` | `#7d5d1d` | Pending text |
| `red` | `#b3402f` | Failure and destructive action |
| `red-soft` | `#f3dfda` | Error/destructive background |

### Dark theme

| Token | Value |
|---|---:|
| `paper` | `#17150f` |
| `paper-2` | `#201d15` |
| `card` | `#26221a` |
| `ink` | `#ece7da` |
| `ink-2` | `#b6ae9d` |
| `ink-3` | `#857c6a` |
| `line` | `#37332a` |
| `line-2` | `#474235` |
| `pine` | `#5a9377` |
| `pine-soft` | `#232d26` |
| `pine-ink` | `#a7cdbb` |
| `pine-hover` | `#4a7d64` |
| `pine-strong` | `#2e5c49` |
| `terra` | `#d4795a` |
| `terra-soft` | `#332320` |
| `amber` | `#d2a54e` |
| `amber-soft` | `#2d2519` |
| `amber-ink` | `#d2a54e` |
| `red` | `#dc8672` |
| `red-soft` | `#332220` |

### Shape and elevation

- Base radius: `10px`.
- Standard panels/list rows: `12px`.
- Marketing and pricing cards: up to `16px`.
- Pills/chips/buttons: fully rounded when appropriate.
- Light shadow: `0 1px 2px rgb(32 29 24 / .05), 0 12px 32px -18px rgb(32 29 24 / .25)`.
- Dark shadow: `0 1px 2px rgb(0 0 0 / .3), 0 16px 40px -20px rgb(0 0 0 / .6)`.

Use shadows sparingly. Borders carry most of the hierarchy.

## 7. Typography

| Role | Family | Weights |
|---|---|---|
| Display and headings | Fraunces | 400, 500, 600 |
| Body and controls | Instrument Sans | 400, 500, 600 |
| Data, statuses, coordinates | IBM Plex Mono | 400, 500 |

Guidelines:

- Base body: `15px`, `1.5` line height.
- Marketing hero: responsive `42–64px`, approximately `1.04` line height.
- Public/legal title: responsive `40–56px`.
- App page title: approximately `32px`.
- Card title: `16–20px` depending on hierarchy.
- Metadata: `11–13px`; monospace labels may be uppercase with increased tracking.
- Avoid more than three font weights on one screen.
- Use tabular numerals for counts, scores, prices, and coordinates.

Production font loading must avoid visible layout shift. Self-hosting is preferred if practical; otherwise preload only the required Google Font files/weights.

## 8. Layout dimensions

- Public content maximum width: `1120px`.
- Public horizontal page padding: `24px` desktop; at least `16px` mobile.
- Authenticated sidebar: `232px` desktop.
- Authenticated content target maximum width: `1180px` where a constrained reading width is useful.
- Standard app content padding: approximately `34px 42px 60px` desktop.
- Chart-builder desktop columns: `300px minmax(0, 1fr) 280px`, `20px` gap.
- Chart detail: main result area plus approximately `300px` summary rail.
- Pricing content maximum width: `920px`.
- Legal content maximum width: `1000px`; approximately `210px` table of contents, `680px` reading column, and `72px` gap.

The seat map is the primary work surface. Preserve usable seat dimensions and allow its panel to scroll horizontally rather than shrinking seats until labels become unreadable.

## 9. Core components

### Brand mark

A compact rounded-square grid mark paired with the ClassPrints name. Use the display typeface for the wordmark. Do not add a tagline inside navigation.

### Buttons

- Primary: pine fill, high-contrast text.
- Secondary: transparent/paper background with line border.
- Destructive: red, only for genuinely destructive actions.
- Compact and standard sizes; no unnecessary size variants.
- Loading buttons preserve their width and announce progress.

### Cards and panels

Cards use a card surface, one-pixel semantic border, and restrained elevation. Avoid nesting multiple heavily shadowed cards.

### Status chips

Required states:

- Ready: pine.
- Generating/pending: amber with text and optional motion indicator.
- Failed: red.
- Draft/unsaved: neutral paper surface and border.

Status must always include text; color alone is insufficient.

### Chart list row

Each row contains:

- seating-map thumbnail
- classroom/chart name
- created date and student count
- status chip
- navigation affordance

Rows must be fully keyboard reachable and expose an unambiguous accessible name.

### Chart builder

Desktop composition:

1. Student roster and selection.
2. Primary seating map/work area.
3. Summary and generation controls.

Builder concepts remain:

- layout
- students
- submit/generate
- algorithmic versus AI-assisted generation
- conflicts
- works-well preferences
- strong preferences
- allowed/preferred seats
- result count

Use one shared builder implementation for new charts and config-based arrangements. Differences are input mode and initial state, not separate duplicated page implementations.

### Seat map

- Show row and column coordinates.
- Occupied, empty, selected, conflict, and preferred/allowed states require visible labels or patterns in addition to color.
- Seat controls must be keyboard operable.
- Do not make names depend on initials alone when full names can be exposed through accessible labels or adjacent detail.

### Legal pages

- Narrow reading column.
- Sticky table of contents on desktop; inline/wrapped links on mobile.
- Plain-language summary near the top.
- Standard document flow; no card around every section.
- Terms and Privacy must cross-link.

## 10. Responsive behavior

### Desktop (`lg` and above)

- Persistent sidebar.
- Three-column builder.
- Two-column pricing.
- Sticky legal-page table of contents.

### Tablet

- Sidebar may collapse to an icon rail only if labels remain available and the builder retains enough room; otherwise use a drawer.
- Builder may become two rows: roster plus work area, followed by summary.
- Header actions wrap without overlapping titles.

### Mobile

- Sidebar becomes an accessible drawer.
- Public navigation becomes a compact menu.
- Builder becomes one column in task order: setup/roster, seat map, summary/generate.
- Pricing cards stack.
- Legal table of contents becomes a wrapped inline link group.
- Chart-list metadata stacks beneath the title.
- Footer copyright and links may stack.
- Minimum interactive target: `44px` where practical.

Never use a fixed footer on mobile.

## 11. Accessibility requirements

- Meet WCAG 2.2 AA color contrast for text and controls.
- Provide visible `:focus-visible` treatment in both themes.
- All icon-only controls require accessible names.
- Navigation drawers and dialogs trap focus and restore focus on close.
- Escape closes dismissible overlays.
- Respect `prefers-reduced-motion`; animation is enhancement, not required feedback.
- Statuses and relationship types cannot rely only on color.
- Form errors must associate with their fields and remain visible until resolved.
- Loading, empty, success, and error states must be announced appropriately.
- Use semantic `header`, `nav`, `main`, `aside`, `section`, and `footer` elements.
- Legal pages and long forms need logical heading order.
- Preserve keyboard operation for seat placement, student selection, tabs, and result options.

## 12. Approved content direction

### Landing hero

- **Eyebrow:** Smarter classroom seating
- **Headline:** Every student, in the right seat.
- **Description:** ClassPrints turns your class roster, classroom dynamics, and room layout into an optimized seating chart—algorithmic or AI-assisted—in seconds.
- **Primary CTA:** Create your first chart
- **Secondary CTA:** See pricing
- **Supporting line:** Start free today · Need more? See premium plans

“Premium plans” links to `/pricing`.

### Feature cards

**1. Classroom dynamics, accounted for**

Separate students who distract one another, place supportive peers together, and factor in individual seating needs.

**2. Multiple ways to build**

Choose the arrangement method that fits your classroom while accounting for every relationship, preference, and constraint that matters.

**3. Compare, choose, export**

Generate up to five candidate layouts, compare their scores, and export the best fit as CSV.

### Pricing

**Heading:** Plans that fit your classroom.

**Description:** Start free. Upgrade for more weekly charts, reusable class profiles, and exports.

Display pricing and paid-plan descriptions from the existing billing API. Do not hardcode production plan prices from the mockup.

Current product limits to represent accurately:

- Free: 2 arrangements per week, 1 result per run, results visible for 30 days, no saved profiles, no CSV export.
- Plus: 10 arrangements per week, up to 5 results per run, unlimited result visibility, saved profiles, CSV export, and result email support.
- AI-assisted generation is controlled by the existing feature flag and is not currently a Plus-only feature.

## 13. Frontend implementation guidance

This section is architectural guidance, subordinate to the approved visual behavior.

### Recommended organization

```text
src/
  routes/
    public/
    auth/
    app/
  features/
    auth/
    charts/
    chart-builder/
    configs/
    pricing/
    settings/
    legal/
  components/
    layout/
    navigation/
    ui/
  hooks/
  lib/
  styles/
```

Key requirements:

- Keep route URLs unchanged.
- Move route protection to route boundaries/`beforeLoad`.
- Separate public, auth, and authenticated layouts.
- Consolidate `create-arrangement.tsx` and `configs-arrangement.tsx` into one chart-builder feature with explicit mode/initial-state inputs.
- Move list/config fetching to TanStack Query and centralized query keys.
- Preserve current API request/response shapes and authentication behavior.
- Keep backend packages, workers, database schemas, and business rules untouched.
- Migrate callers in one clean cutover; do not retain duplicate builder implementations or compatibility aliases.
- Use Tailwind v4 CSS-first theme definitions if the frontend configuration is modernized.

## 14. Required states

Every data-driven page must design and implement:

- initial loading
- background refresh
- empty result
- recoverable error
- permission/auth redirect
- success
- disabled action
- submitted/pending action

Chart-specific states:

- draft/unsaved
- queued
- generating
- ready
- failed
- no results
- one result
- multiple result options
- duplicate job returned

The loading state must preserve approximate layout and avoid full-page flashes during background refreshes.

## 15. Legal and data caveats

The mockup includes simplified Terms and Privacy pages, but the text requires qualified legal review before production publication.

Known facts that the frontend must not contradict:

1. **AI processing:** AI-assisted generation sends student names, classroom layout, relationships, and seating constraints to OpenRouter and selected model providers. Programmatic generation does not use that external AI provider.
2. **Diagnostic logging:** Worker diagnostics currently may include generated seating arrangements and student names.
3. **Account deletion:** The current endpoint soft-deletes the user profile and cancels an active subscription; it does not automatically purge every classroom job or config.
4. **Payments:** Stripe handles payment-card details. ClassPrints receives subscription/customer identifiers and billing status.
5. **Governing law:** The repository does not establish a verified legal entity, governing jurisdiction, or venue. Do not publish an invented California/San Francisco clause.
6. **Education compliance:** Do not claim FERPA or COPPA certification or compliance without legal and operational evidence. The product may instruct educators to follow applicable law and school policy.

Reference structures used when drafting the mockup copy:

- [Linear Terms](https://linear.app/terms) and [Privacy Policy](https://linear.app/privacy)
- [Slack User Terms](https://slack.com/terms-of-service/user) and [Privacy Policy](https://slack.com/trust/privacy/privacy-policy)
- [Canva Terms](https://www.canva.com/policies/terms-of-use/) and [Privacy Policy](https://www.canva.com/policies/privacy-policy/)
- [OpenRouter Privacy Policy](https://openrouter.ai/privacy)

These were structural references only; ClassPrints policy text must remain tailored to actual ClassPrints behavior.

## 16. Acceptance checklist

### Visual system

- [ ] Light and dark tokens match this handoff.
- [ ] Theme toggle persists through `localStorage.theme`.
- [ ] No flash of the wrong theme on initial load.
- [ ] Fraunces, Instrument Sans, and IBM Plex Mono roles are consistent.
- [ ] Status colors and labels are consistent across pages.
- [ ] Mockup switcher bar is not present in production.

### Navigation and layout

- [ ] Public pages use the public header.
- [ ] Authenticated pages use the sidebar.
- [ ] Mobile navigation uses an accessible drawer/menu.
- [ ] Public footer is sticky in layout but never fixed over content.
- [ ] Authenticated workspace pages do not show a footer.
- [ ] Public navbar remains full width within its `1120px` maximum.
- [ ] Pricing, Terms, Privacy, and Support work while signed out.

### Pages

- [ ] Every existing route remains available.
- [ ] Landing copy is education-first.
- [ ] Charts list supports loading, empty, generating, ready, and failed states.
- [ ] Chart detail presents progress, result options, scores, and export actions.
- [ ] New and config-based arrangements share one builder implementation.
- [ ] Settings retains account, subscription, notification, email, and deletion flows.
- [ ] Pricing uses live billing-plan data.
- [ ] Legal pages use the approved readable layout and are counsel-reviewed before release.

### Accessibility and responsiveness

- [ ] Keyboard access covers all navigation, dialogs, tabs, students, seats, and result options.
- [ ] Focus styling is visible in both themes.
- [ ] Color is never the only status indicator.
- [ ] Text and controls meet WCAG AA contrast.
- [ ] Layouts work at mobile, tablet, and desktop widths.
- [ ] Seat maps remain readable and scroll instead of over-compressing.
- [ ] Reduced-motion preferences are respected.

### Scope and regression safety

- [ ] No backend logic, schema, worker, or API contract changes are included.
- [ ] Authentication and billing flows remain functional.
- [ ] Existing plan limits remain authoritative.
- [ ] No duplicated builder implementation remains.
- [ ] All affected routes and states are smoke-tested in the actual application.
