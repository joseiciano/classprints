
export const meta = {
  name: 'ticket-stack',
  description: 'Implement numbered tickets from a plans/ directory one by one, each on its own branch stacked on the previous, with review and a PR per ticket',
  phases: [
    { title: 'Discover' },
    { title: 'Implement' },
    { title: 'Review' },
    { title: 'Ship' },
  ],
}

// args: { ticketsDir: string, baseBranch: string, maxReviewRounds?: number }

const TICKETS_SCHEMA = {
  type: 'object',
  properties: {
    tickets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'number' },
          file: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['number', 'file'],
      },
    },
  },
  required: ['tickets'],
}

const SETUP_SCHEMA = {
  type: 'object',
  properties: {
    worktreePath: { type: 'string' },
    branchName: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['worktreePath', 'branchName'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    clean: { type: 'boolean' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'number' },
          severity: { type: 'string' },
        },
        required: ['summary'],
      },
    },
  },
  required: ['clean', 'findings'],
}

const SHIP_SCHEMA = {
  type: 'object',
  properties: {
    prUrl: { type: 'string' },
    branchName: { type: 'string' },
  },
  required: ['branchName'],
}

const ATTRIBUTION = `When committing, end each commit message with:
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
When opening a pull request, end the PR description with:
🤖 Generated with [Claude Code](https://claude.com/claude-code)`

const ticketsDir = args.ticketsDir
const baseBranch = args.baseBranch
const maxReviewRounds = args.maxReviewRounds || 3

if (!ticketsDir || !baseBranch) {
  throw new Error('ticket-stack requires args: { ticketsDir, baseBranch }')
}

phase('Discover')
const discovery = await agent(
  `List every ticket file directly inside "${ticketsDir}" whose filename encodes a sequence number ` +
  `(e.g. "step-06-foo.md", "ticket-3-bar.md" — any "<prefix>-<N>-<rest>" pattern where N is an integer). ` +
  `Ignore files in that directory with no number in the name. For each numbered file, read its YAML ` +
  `frontmatter "status" field (fall back to a "Status: <word>" badge/text in the body if there is no ` +
  `frontmatter). Return only tickets whose status is NOT "Completed" (case-insensitive) — skip anything ` +
  `already completed. For each pending ticket return its number (the integer from the filename), its file ` +
  `path relative to the repo root, and a short title from the frontmatter "goal" field or the first H1 ` +
  `heading. Sort ascending by number. If nothing is pending, return an empty tickets array.`,
  { phase: 'Discover', schema: TICKETS_SCHEMA, label: 'discover' }
)

const pending = (discovery?.tickets ?? []).slice().sort((a, b) => a.number - b.number)
log(`Found ${pending.length} pending ticket(s): ${pending.map((t) => t.file).join(', ') || '(none)'}`)

const results = []
let currentBase = baseBranch

for (const ticket of pending) {
  log(`Starting ticket #${ticket.number}: ${ticket.file}`)

  phase('Implement')
  const setup = await agent(
    `You are implementing one ticket from a stacked sequence of tickets in this repo. Work in your isolated worktree.\n\n` +
    `Ticket file: ${ticket.file}\n` +
    `Base branch to build on: ${currentBase}\n\n` +
    `Steps:\n` +
    `1. Run "git fetch origin", then create and check out a new branch off "origin/${currentBase}" ` +
    `(not whatever branch your worktree started on). Name it something short and descriptive derived ` +
    `from the ticket filename, e.g. "ticket/<slug>".\n` +
    `2. Read the ticket file fully, plus any sibling files it references for context (e.g. an ` +
    `"implementation-details.md" in the same directory).\n` +
    `3. Implement the ticket completely per its stated requirements and acceptance criteria.\n` +
    `4. Follow this repo's AGENTS.md workflow conventions: commit as you go with descriptive messages ` +
    `(don't batch unrelated changes into one commit), run "pnpm typecheck" and "pnpm build" after your ` +
    `changes (and "npx vitest run" if you touched reducer/FSM behavior), and fix any failures before moving on.\n` +
    `5. Update the ticket file's frontmatter "status" to 'Completed' (and its status badge/text if present), ` +
    `and commit that too.\n` +
    `6. Push the branch to origin.\n\n` +
    `${ATTRIBUTION}\n\n` +
    `Report back the absolute worktree path, the exact branch name you created, and a one-paragraph summary ` +
    `of what you implemented.`,
    { phase: 'Implement', schema: SETUP_SCHEMA, isolation: 'worktree', label: `implement:${ticket.file}` }
  )

  if (!setup) {
    log(`Ticket #${ticket.number} (${ticket.file}) failed during implementation — stopping the chain so later tickets don't stack on broken work.`)
    results.push({ ticket, status: 'failed-implement' })
    break
  }

  let clean = false
  let anyReviewSucceeded = false
  let round = 0
  while (!clean && round < maxReviewRounds) {
    round++
    phase('Review')
    const review = await agent(
      `Independently code-review branch "${setup.branchName}" in the worktree at ${setup.worktreePath} ` +
      `(cd there first; diff against "origin/${currentBase}" or "${currentBase}"). You did not write this ` +
      `code — review it with fresh eyes for real correctness bugs, not style nits. Also confirm it actually ` +
      `satisfies the requirements and acceptance criteria in ${ticket.file}. Only report clean=true if there ` +
      `are no real issues.`,
      { phase: 'Review', schema: REVIEW_SCHEMA, label: `review:${ticket.file}:${round}` }
    )

    if (!review) {
      log(`Ticket #${ticket.number} review round ${round}: review agent did not return a result — retrying.`)
      continue
    }
    anyReviewSucceeded = true

    if (review.clean || !review.findings || review.findings.length === 0) {
      clean = true
      break
    }

    log(`Ticket #${ticket.number} review round ${round}: ${review.findings.length} finding(s) — fixing.`)
    await agent(
      `In the worktree at ${setup.worktreePath} (cd there first), on branch "${setup.branchName}", fix these ` +
      `code review findings:\n${JSON.stringify(review.findings, null, 2)}\n\n` +
      `Re-run "pnpm typecheck" and "pnpm build" after fixing. Commit the fix with a descriptive message and ` +
      `push the branch.\n\n${ATTRIBUTION}`,
      { phase: 'Review', label: `fix:${ticket.file}:${round}` }
    )
  }

  if (!clean) {
    if (!anyReviewSucceeded) {
      log(`Ticket #${ticket.number} never got a successful review after ${maxReviewRounds} attempt(s) — shipping unreviewed, flagged in the final report.`)
    } else {
      log(`Ticket #${ticket.number} still had open findings after ${maxReviewRounds} review round(s) — shipping anyway, flagged in the final report.`)
    }
  }

  phase('Ship')
  const ship = await agent(
    `In the worktree at ${setup.worktreePath} (cd there first), open a pull request for branch ` +
    `"${setup.branchName}" targeting base branch "${currentBase}" using the gh CLI. Title and body should ` +
    `summarize the ticket (${ticket.file}) and what changed. Follow this repo's AGENTS.md PR conventions.\n\n` +
    `${ATTRIBUTION}\n\n` +
    `Return the PR URL and confirm the exact branch name.`,
    { phase: 'Ship', schema: SHIP_SCHEMA, label: `ship:${ticket.file}` }
  )

  const branchName = ship?.branchName ?? setup.branchName
  const shipFailed = !ship || !ship.prUrl
  if (shipFailed) {
    log(`Ticket #${ticket.number} (${ticket.file}): ship step did not confirm a PR URL — branch "${branchName}" is pushed, but PR creation could not be confirmed. Check manually before relying on it as a stack base.`)
  }

  results.push({
    ticket,
    status: shipFailed
      ? 'ship-failed'
      : clean
        ? 'shipped'
        : anyReviewSucceeded
          ? 'shipped-with-findings'
          : 'shipped-unreviewed',
    branchName,
    prUrl: ship?.prUrl ?? null,
  })

  await agent(
    `From the main repository in your current working directory (not the ticket worktree), remove the now-unneeded ` +
    `git worktree at "${setup.worktreePath}" by running: git worktree remove "${setup.worktreePath}" --force\n\n` +
    `Its branch "${branchName}" is already pushed to origin, so the worktree directory itself is disposable. ` +
    `If the remove command fails for any reason, just report why — don't retry or block.`,
    { phase: 'Ship', label: `cleanup:${ticket.file}` }
  )

  currentBase = branchName
  log(`Ticket #${ticket.number} done → branch ${currentBase}${ship?.prUrl ? `, PR ${ship.prUrl}` : ''}`)
}

return { ticketsDir, startingBaseBranch: baseBranch, finalBranch: currentBase, processed: results }
