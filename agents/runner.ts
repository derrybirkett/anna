import fs from "fs/promises";
import path from "path";
import yaml from "yaml";
import { Octokit } from "@octokit/core";
import { callClaude } from "@/lib/claude";

interface Config {
  advisor: string;
  enabled: boolean;
  schedule: string;
  on_demand: boolean;
  repo: {
    name: string;
    path: string;
  };
  advisor_config: {
    playbook: string;
    model: string;
    max_tokens: number;
  };
  files_to_review: string[];
  github: {
    repo: string;
    labels: string[];
  };
  output: {
    format: string;
    title_prefix: string;
  };
}

interface Recommendation {
  type: "BUILD" | "CUT" | "FIX" | "DEFER";
  text: string;
}

interface ReviewResult {
  success: boolean;
  review?: string;
  recommendations?: Recommendation[];
  saved_to?: string;
  issues_created?: number;
  error?: string;
}

const AGENTS_DIR = path.join(process.cwd(), "agents");

function findCouncilDir(): string {
  const cwd = process.cwd();

  for (let i = 0; i <= 3; i++) {
    const candidate = path.join(cwd, "..".repeat(i), "council");
    try {
      require("fs").accessSync(candidate);
      return candidate;
    } catch {}
  }

  return path.join(cwd, "council");
}

const COUNCIL_DIR = findCouncilDir();

export async function loadConfig(): Promise<Config> {
  const configPath = path.join(AGENTS_DIR, "agents.yaml");
  const configContent = await fs.readFile(configPath, "utf-8");
  return yaml.parse(configContent) as Config;
}

export async function loadPlaybook(advisor: string, playbookName: string): Promise<string> {
  const playbookPath = path.join(
    COUNCIL_DIR,
    "advisors",
    advisor,
    "playbooks",
    `${playbookName}.md`
  );
  return fs.readFile(playbookPath, "utf-8");
}

export async function loadPrompt(advisor: string): Promise<string> {
  const promptPath = path.join(COUNCIL_DIR, "advisors", advisor, "prompt.md");
  return fs.readFile(promptPath, "utf-8");
}

export async function readFilesToReview(filePaths: string[]): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const filePath of filePaths) {
    try {
      const fullPath = path.join(process.cwd(), filePath);
      const content = await fs.readFile(fullPath, "utf-8");
      files[filePath] = content;
    } catch {
      files[filePath] = `[File not found: ${filePath}]`;
    }
  }
  return files;
}

export function parseRecommendations(reviewText: string): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const lines = reviewText.split("\n");

  for (const line of lines) {
    const match = line.match(/^\d+\.\s*\*\*(\w+)\*\*:\s*(.+)$/);
    if (match) {
      const type = match[1].toUpperCase();
      if (["BUILD", "CUT", "FIX", "DEFER", "INVEST"].includes(type)) {
        recommendations.push({
          type: type as Recommendation["type"],
          text: match[2].trim(),
        });
      }
    }
  }

  return recommendations;
}

export async function createGitHubIssues(
  recommendations: Recommendation[],
  repo: string,
  reviewDate: string
): Promise<number> {
  const token = process.env.GH_TOKEN;
  if (!token) {
    console.warn("GH_TOKEN not found, skipping issue creation");
    return 0;
  }

  const [owner, repoName] = repo.split("/");
  const octokit = new Octokit({ auth: token });

  let created = 0;

  for (const rec of recommendations) {
    const labelMap: Record<string, string[]> = {
      BUILD: ["product-review", "build"],
      CUT: ["product-review", "cut"],
      FIX: ["product-review", "fix"],
      DEFER: ["product-review", "defer"],
      INVEST: ["product-review", "invest"],
    };

    const body = `## Source\nWeekly Product Review: ${reviewDate}\n\n## Recommendation\n${rec.type}: ${rec.text}`;

    try {
      await octokit.request("POST /repos/{owner}/{repo}/issues", {
        owner,
        repo: repoName,
        title: `[${rec.type}] ${rec.text.slice(0, 200)}`,
        body,
        labels: labelMap[rec.type],
      });
      created++;
    } catch (err) {
      console.error(`Failed to create issue: ${rec.text.slice(0, 50)}`, err);
    }
  }

  return created;
}

export async function runProductReview(): Promise<ReviewResult> {
  const config = await loadConfig();

  if (!config.enabled) {
    return { success: false, error: "Product advisor is not enabled." };
  }

  const [playbook, prompt] = await Promise.all([
    loadPlaybook(config.advisor, config.advisor_config.playbook),
    loadPrompt(config.advisor),
  ]);

  const files = await readFilesToReview(config.files_to_review);

  const filesSummary = Object.entries(files)
    .map(([name, content]) => `## ${name}\n\n\`\`\`\n${content.slice(0, 3000)}\n\`\`\``)
    .join("\n\n");

  const systemPrompt = `${prompt}\n\n## Playbook\n\n${playbook}`;

  const userPrompt = `# Repo Review\n\nReview the following repository files and provide product advice.\n\n${filesSummary}\n\n---\n\nFollow the playbook output format. Be ruthless about prioritization. Identify what to cut before what to add.`;

  const review = await callClaude(userPrompt, systemPrompt);

  const timestamp = new Date().toISOString().split("T")[0];
  const saveDir = path.join(AGENTS_DIR, "reviews");
  const savePath = path.join(saveDir, `${timestamp}.md`);

  await fs.mkdir(saveDir, { recursive: true });
  await fs.writeFile(savePath, review, "utf-8");

  const recommendations = parseRecommendations(review);
  let issuesCreated = 0;

  if (recommendations.length > 0) {
    issuesCreated = await createGitHubIssues(
      recommendations,
      config.github.repo,
      timestamp
    );
  }

  return {
    success: true,
    review,
    recommendations,
    saved_to: savePath,
    issues_created: issuesCreated,
  };
}

export async function main() {
  const result = await runProductReview();

  if (result.success && result.review) {
    console.log(result.review);
    console.log(`\n---\nSaved to: ${result.saved_to}\nIssues created: ${result.issues_created}`);
  } else {
    console.error(result.error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}