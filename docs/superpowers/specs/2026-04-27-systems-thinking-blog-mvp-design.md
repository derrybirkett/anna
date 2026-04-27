---
name: Systems Thinking Blog MVP
description: Auto-publishing systems thinking blog with AI-driven research workflow, scheduled weekly via Vercel Cron
type: design
date: 2026-04-27
---

# Systems Thinking Blog MVP - Design Specification

## Context

This project addresses the tendency to overengineer solutions by building the simplest possible automated content platform. The goal is to research, synthesize, and publish systems thinking content with minimal complexity.

The user wants to avoid complex agent frameworks, databases, and abstractions. The core need is: every Thursday, automatically process a topic through research → synthesis → article writing → workshop creation, then publish the article to a blog.

## Mission

Build an automated systems thinking research and writing platform that:
- Publishes articles weekly without manual intervention
- Uses AI to research topics, synthesize findings, and write content
- Displays articles as a simple blog
- Stays under 500 lines of code total

## Architecture

### High-Level Structure

Three core pieces:
1. **Cron trigger** - Vercel Cron hits `/api/cron/thursday` every Thursday
2. **Workflow engine** - Single async function runs 4 sequential Claude API calls
3. **Blog homepage** - Lists published articles

### Technology Stack

- **Framework**: Next.js (App Router)
- **Hosting**: Vercel (with Cron)
- **AI**: Claude API via Anthropic SDK (with prompt caching)
- **Storage**: Filesystem only (no database)
- **Styling**: Minimal CSS (or Tailwind if preferred)

### Data Storage

Everything lives in files:

```
/content/
├── topics.txt                      # One topic per line
├── state.json                      # {"currentIndex": 0}
└── published/                      # Generated content
    └── YYYY-MM-DD-topic-slug/
        ├── research.md             # Internal - not displayed
        ├── synthesis.md            # Internal - not displayed
        ├── article.md              # Displayed on blog
        └── workshop.md             # Stored for future use
```

No database. No KV store. Just markdown files and JSON.

## Workflow Engine

### Process Flow

Every Thursday at a scheduled time:

1. **Cron trigger** hits `/api/cron/thursday/route.ts`
2. **Read next topic** from `topics.txt` (using line number in `state.json`)
3. **Run 4 sequential Claude API calls**, each building on the previous:

   **Call 1 - Research**
   - Prompt: "Research this topic: {topic}. Find key concepts, theories, practitioners, real-world examples in systems thinking."
   - Output: `research.md`

   **Call 2 - Synthesis**
   - Prompt: "Here's research on {topic} (attached). Synthesize patterns, connections, and principles."
   - Context: Includes `research.md` via prompt caching
   - Output: `synthesis.md`

   **Call 3 - Article**
   - Prompt: "Here's the synthesis (attached). Write a 1000-word article for systems thinking practitioners."
   - Context: Includes `synthesis.md` via prompt caching
   - Output: `article.md` (with frontmatter: title, date, topic)

   **Call 4 - Workshop**
   - Prompt: "Here's the article (attached). Create a 90-minute workshop with exercises and discussion prompts."
   - Context: Includes `article.md` via prompt caching
   - Output: `workshop.md`

4. **Save all outputs** to `/content/published/YYYY-MM-DD-topic-slug/`
5. **Increment `state.json`** to mark topic as processed
6. **Return success** to cron endpoint

### Implementation Files

- **`lib/workflow.ts`** (200-300 lines) - Main workflow orchestration
- **`lib/claude.ts`** (~50 lines) - Anthropic SDK wrapper with retry logic
- **`lib/content.ts`** (~100 lines) - File reading/writing utilities

No branching logic, no decisions, no agent framework. Just sequential API calls with context passing.

## Blog Display

### Homepage (`/app/page.tsx`)

Blog index that:
- Scans `/content/published/` for dated folders
- Reads `article.md` from each (parses frontmatter)
- Displays reverse-chronological list:
  - Article title
  - Publication date
  - Excerpt (first 200 chars)
  - Link to `/article/[slug]`

Simple, clean list. No sidebar, no tags, no search initially.

### Article Pages (`/app/article/[slug]/page.tsx`)

Dynamic route that:
- Reads markdown file for the slug
- Parses frontmatter (title, date, topic)
- Renders content with `react-markdown` or similar
- Shows: title, date, article body
- No comments, sharing buttons, or related posts initially

### Article Frontmatter Format

```markdown
---
title: "Systems Thinking in Education"
date: "2026-04-24"
topic: "systems-thinking-education"
---

Article content here...
```

## Project Structure

```
/
├── app/
│   ├── page.tsx                    # Blog homepage (article list)
│   ├── article/[slug]/page.tsx     # Individual article pages
│   └── api/
│       └── cron/
│           └── thursday/route.ts   # Cron endpoint
├── lib/
│   ├── workflow.ts                 # Main workflow engine (~250 lines)
│   ├── claude.ts                   # Anthropic SDK wrapper (~50 lines)
│   └── content.ts                  # File utilities (~100 lines)
├── content/
│   ├── topics.txt                  # Seed with initial topics
│   ├── state.json                  # {"currentIndex": 0}
│   └── published/                  # Generated by workflow
├── vercel.json                     # Cron schedule configuration
├── package.json
├── tsconfig.json
└── next.config.js
```

**Total estimated lines**: ~500 (including Next.js boilerplate)

## Configuration

### Vercel Cron (`vercel.json`)

```json
{
  "crons": [{
    "path": "/api/cron/thursday",
    "schedule": "0 10 * * 4"
  }]
}
```

Schedule: Every Thursday at 10:00 AM UTC

### Environment Variables

```
ANTHROPIC_API_KEY=sk-...
VERCEL_CRON_SECRET=... (for cron authentication)
```

## Phase 1 Scope

**Included:**
- Automated weekly workflow (research → synthesize → write → publish)
- Blog homepage showing article list
- Individual article pages
- Vercel Cron scheduling
- File-based storage
- Claude API integration with prompt caching

**Explicitly NOT included (can add later):**
- Display of research/synthesis notes
- Workshop material pages
- Manual topic submission UI
- Search or filtering
- Comments or social features
- Analytics
- RSS feed
- Mobile app

## Testing & Verification

### Local Development Testing

1. **Manual workflow trigger**: Create a test endpoint `/api/test/workflow?topic=test-topic` that runs the workflow on demand
2. **Verify outputs**: Check that all 4 markdown files are created with expected content
3. **Check blog display**: Ensure article appears on homepage and individual page renders correctly
4. **Test topic progression**: Verify `state.json` increments properly

### Production Verification

1. **Deploy to Vercel**
2. **Seed topics.txt** with 5-10 initial topics
3. **Wait for first Thursday** or manually trigger cron endpoint
4. **Verify**:
   - Article published to blog
   - Content is coherent and properly formatted
   - Next topic queued correctly
   - No errors in Vercel logs

### Success Criteria

- ✅ Workflow completes in under 5 minutes
- ✅ Articles are well-researched and coherent (1000+ words)
- ✅ Blog displays properly on desktop and mobile
- ✅ No manual intervention needed after initial setup
- ✅ Total codebase under 500 lines (excluding node_modules)

## Implementation Priorities

1. **Core workflow engine** - Get the 4-step Claude loop working locally
2. **File storage utilities** - Read topics, save outputs, manage state
3. **Blog display** - Homepage list + article pages
4. **Cron integration** - Hook up Vercel Cron to workflow
5. **Deployment** - Push to Vercel, configure env vars, test end-to-end

## Design Principles Applied

**Simplicity over flexibility**: Hard-coded 4-step workflow. No configuration, no plugins, no extensibility initially.

**Files over databases**: Markdown files are human-readable, git-friendly, and require zero infrastructure.

**Sequential over parallel**: No task queues, no job runners. One topic, four API calls, done.

**Generated over authored**: The AI does all content creation. No manual writing, editing, or approval flow.

**Static over dynamic**: Blog pages can be statically generated at build time if needed (though dynamic is fine for MVP).

## Future Enhancements (Out of Scope for MVP)

- Admin UI to add topics manually
- Display research notes and synthesis docs
- Workshop material pages with interactive elements
- Email newsletter integration
- RSS feed
- Topic suggestions based on trending systems thinking discussions
- Multi-format output (Twitter threads, LinkedIn posts)
- Analytics and engagement tracking

## Critical Files Summary

**Must create:**
- `lib/workflow.ts` - Core 4-step workflow engine
- `lib/claude.ts` - Anthropic SDK client wrapper
- `lib/content.ts` - File I/O utilities
- `app/api/cron/thursday/route.ts` - Cron endpoint
- `app/page.tsx` - Blog homepage
- `app/article/[slug]/page.tsx` - Article pages
- `content/topics.txt` - Initial topic list
- `content/state.json` - Workflow state tracker
- `vercel.json` - Cron configuration

**Reuse from Next.js:**
- Standard App Router setup
- TypeScript configuration
- Package.json with Anthropic SDK

## Notes

- **Prompt caching**: Use Claude's prompt caching to pass research → synthesis → article context efficiently
- **Error handling**: If any step fails, log to Vercel and skip to next topic next week (or retry once)
- **Rate limits**: Claude API should handle 4 sequential calls fine; add 1-2 second delays if needed
- **Topic exhaustion**: When `state.json` index exceeds topics.txt length, loop back to start or log warning
