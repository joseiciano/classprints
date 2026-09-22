# Assignment Reader — mockup agent spec

Read this fully before writing any file. The design system is already built: `plan/assignment-reader/mockups/assets/mockup.css`.

> Realigned to PRD resolved decision 11 (one workspace per document): `05-workspace.html` replaces the former `05-review.html` + `06-grading.html` pair.

## Hard rules

1. Every page is a **standalone static HTML file**, no JS logic needed (pure markup; a `<script>` is allowed ONLY if your assigned section requires a tiny interaction — default to none).
2. Every page starts with `<html>`, `<head>` with `<meta charset>`, `<title>`, `<meta name="viewport">`, `<link rel="stylesheet" href="assets/mockup.css">`, and `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` inside head, and `<body class="mockup">`.
3. Structure every page exactly like this skeleton:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Assignment Reader · {Screen}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="assets/mockup.css">
</head>
<body class="mockup">

  <header class="screen-head">
    <span class="wf-tag">Wireframe · not visual design</span>
    <div class="screen-title">{Title with one <em>italic accent</em>}</div>
    <p class="screen-sub">{One or two sentences tying the screen to the PRD.}</p>
  </header>

  <main class="frame">
    <div class="frame-bar">
      <span class="dots"><i></i><i></i><i></i></span>
      <span class="path">{screen path}</span>
      <span class="flow-name">{PRD capability #}</span>
    </div>
    <div class="frame-body">
      {app chrome: .appbar with .brand (mark "A", text "Assignment Reader") + .who (name Elena Ellis + .avatar EE)}
      {screen content}
    </div>
  </main>

  <nav class="nav-next">
    <a href="index.html">⌂ Overview</a>
    <a href="01-dashboard.html">01 Dashboard</a>
    <a href="02-assignment.html">02 Assignment</a>
    <a href="03-upload.html">03 Upload</a>
    <a href="04-processing.html">04 Processing</a>
    <a href="05-workspace.html">05 Workspace</a>
  </nav>
  <nav class="nav-next">
    <a href="{prev}.html">← {Prev title}</a>
    <a href="{next}.html">{Next title} →</a>
  </nav>

  <footer class="foot">
    <span>Assignment Reader · product-doc.md markups</span>
    <span>{Screen number / N}</span>
  </footer>

</body>
</html>
```

Mark YOUR screen's link in the first `nav-next` with class `on` (keep both navs).

4. Use ONLY the classes provided in `mockup.css` (plus minimal inline style for layout tweaks like grid templates — allowed sparingly). Read `mockup.css` first to learn available components: `.frame .appbar .split .cols .panel .card .chip .st-* .note .note-float .stamp .photo .hand .thumb .pager .btn .btn-row .editor .meter .steps .seg .modal .veil .field .input .rowline .legend .kbd .crumbs .h-small` etc.
5. **Annotations are the point.** Every screen MUST include numbered `.note` callouts (`<div class="note" data-n="1">…</div>`) whose text cites PRD behavior explicitly (e.g. "PRD 4: page becomes reviewable as soon as its own draft completes"). Notes either sit inline in the layout or absolutely-positioned `.note-float` pinned near the element they annotate (top/right offsets via inline style; keep inside frame bounds).
6. NO emojis except in nav glyphs (⌂ ← →). No lorem ipsum. All sample content must be realistic teacher content (realistic worksheet text, student names, scores).
7. No project-wide commands, no formatters, no lint. Just write your file and verify it exists.

## Canonical scenario (use everywhere, keep consistent)

- Teacher: **Elena Ellis**, class **Grade 3 · Room 12** (also has class "Grade 3 · Science Club" archived example if needed).
- Assignment: **"Fractions worksheet 4 — Equivalent fractions"**, max score **10**, 2 assignment-material pages uploaded & Ready (v2, replaced Mar 3 — v1 noted where versions matter).
- Students: **Maya Rodriguez** (6-page... no — use 3-page submission, Needs review, page 2 completed + editable while page 3 still transcribing OR failed depending on your screen), **Jack Thompson** (Graded, 8.5 / 10, comment "Showed strong fraction sense — watch simplification of 6/8."), **Priya Shah** (Ready), **Sam Okafor** (Failed page retry shown), **Noah Kim** (not started / no submission).
- Materials doc: 2 pages — Page 1 = worksheet instructions ("Name ___ Date ___ Equivalent Fractions..."), Page 2 = fraction wall reference.
- Maya's submission pages: p1 instructions copy + her work, p2 fraction problems, p3 word problem.
- Workspace exemplar (05): **Priya Shah** — Ready, grading rail unlocked (score empty, Mark graded available, Return to Needs review).
- Sample handwriting content (use `.photo > .hand` markup): worksheet heading "Equivalent Fractions", problems like "1/2 = ?/8", word problem "Maya cut her sandwich into 4 equal pieces and ate 2..."
- Dates: today ≈ Mar 7.

## Status color semantics (PRD state model)

- Uploading / Queued / Transcribing → `.st-uploading`, `.st-queued`, `.st-processing` (add `.chip .dot.pulse` for live states)
- Needs review → `.st-review`; Ready → `.st-ready`; Graded → `.st-graded`; Failed → `.st-failed`; Archived/read-only → `.st-archived`
- Assignment materials get a `.stamp` (e.g. `CONTEXT · NOT GRADED`) wherever they appear near submissions.

## File inventory

| File | Content |
|---|---|
| `index.html` | Overview, flow map, screen index (may use inline mermaid-style styled divs; no mermaid lib) |
| `01-dashboard.html` | Classes + assignment list w/ status rollups |
| `02-assignment.html` | Assignment detail: materials doc + submissions grouped by status |
| `03-upload.html` | Upload flow: HEIC note, order-before-transcribe, 20-page/10MB limits |
| `04-processing.html` | Async processing: per-page states, leave-view note, failed page + retry modal, retranscribe consent |
| `05-workspace.html` | Review + grading in one workspace (PRD §5 §6, decision 11): side-by-side original ↔ editable draft, grading rail with Ready gate, return-in-place |

## Review checklist per agent (do this, report "checked" in final message)

- File exists and starts with `<!DOCTYPE html>`.
- Links resolve to existing sibling files (use the nav block verbatim).
- At least 4 numbered notes, each citing concrete PRD behavior.
- Only classes from `mockup.css`; no external CSS/JS/fonts beyond the provided link.
- No emojis in content.
