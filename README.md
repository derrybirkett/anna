# Systems Thinking Blog

Auto-publishing blog for systems thinking research, synthesis, and writing. Every Thursday, AI researches a topic, synthesizes findings, writes an article, and creates workshop materials.

## Features

- 🤖 Fully automated content generation using Claude API
- 📅 Weekly publishing via Vercel Cron (every Thursday at 10am UTC)
- 📝 4-step workflow: Research → Synthesis → Article → Workshop
- 🎨 Clean, minimal blog interface
- 📁 File-based storage (no database)

## Setup

1. **Clone and install:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Copy `.env.local.example` to `.env.local` and add:
   ```
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   VERCEL_CRON_SECRET=your-random-secret-here
   ```

3. **Run locally:**
   ```bash
   npm run dev
   ```

4. **Test workflow:**
   Visit `http://localhost:3000/api/test/workflow?topic=your-test-topic` to trigger a test run.

## Deployment

1. Push to GitHub
2. Import to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

The cron job will automatically run every Thursday.

## Structure

```
/app
  /api/cron/thursday    - Cron endpoint
  /api/test/workflow    - Testing endpoint
  /article/[slug]       - Article pages
  page.tsx              - Homepage

/lib
  claude.ts             - Claude API client
  content.ts            - File utilities
  workflow.ts           - Main workflow engine

/content
  topics.txt            - Topic list
  state.json            - Current topic index
  /published            - Generated articles
```

## Manual Trigger

To manually trigger the weekly workflow:

```bash
curl -X POST http://localhost:3000/api/cron/thursday \
  -H "Authorization: Bearer YOUR_VERCEL_CRON_SECRET"
```

## Adding Topics

Edit `content/topics.txt` and add one topic per line.

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Claude API (Anthropic SDK)
- Vercel (hosting + cron)

Total lines of code: ~450 (excluding node_modules)
