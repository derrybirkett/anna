import { Octokit } from "@octokit/core";
import fs from "fs/promises";
import path from "path";
import yaml from "yaml";

interface Config {
  advisor: string;
  enabled: boolean;
  schedule: string;
  on_demand: boolean;
  repo: {
    name: string;
    path: string;
  };
  github: {
    repo: string;
    labels: string[];
  };
  target_labels: string[];
  complex_label: string;
  output: {
    pr_title_prefix: string;
    max_prs_per_run: number;
  };
}

interface Issue {
  number: number;
  title: string;
  body: string;
  labels: string[];
}

interface BuildResult {
  success: boolean;
  simple_count?: number;
  complex_count?: number;
  error?: string;
}

const AGENTS_DIR = path.join(process.cwd(), "agents");

export async function loadConfig(): Promise<Config> {
  const configPath = path.join(AGENTS_DIR, "builder.yaml");
  const configContent = await fs.readFile(configPath, "utf-8");
  return yaml.parse(configContent) as Config;
}

export async function fetchBuildIssues(
  octokit: Octokit,
  owner: string,
  repo: string,
  labels: string[]
): Promise<Issue[]> {
  const response = await octokit.request("GET /repos/{owner}/{repo}/issues", {
    owner,
    repo,
    labels: labels.join(","),
    state: "open",
    per_page: 20,
  });

  return response.data.map((issue) => ({
    number: issue.number,
    title: issue.title,
    body: issue.body || "",
    labels: issue.labels.map((l) => (typeof l === "string" ? l : l.name)),
  }));
}

export function assessComplexity(issue: Issue): { isComplex: boolean; reason: string } {
  const title = issue.title.toLowerCase();
  const body = (issue.body || "").toLowerCase();
  const fullText = title + " " + body;

  const complexPatterns = [
    { pattern: /database|schema|migration/, reason: "requires database changes" },
    { pattern: /auth|authentication|authorization|permission|security/, reason: "security implications" },
    { pattern: /3\+.*files|multiple.*files|across/, reason: "multiple file changes" },
    { pattern: /new dependency|npm add|install/, reason: "new dependencies" },
    { pattern: /api.*create|endpoint.*new|route.*new/, reason: "new API surface" },
    { pattern: /admin.*panel|management.*ui|interface/, reason: "UI work - complex to implement well" },
    { pattern: /notification|email|slack/, reason: "external integration" },
  ];

  for (const { pattern, reason } of complexPatterns) {
    if (pattern.test(fullText)) {
      return { isComplex: true, reason };
    }
  }

  return { isComplex: false, reason: "appears implementable" };
}

export async function labelIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  issueLabels: string[],
  reason: string,
  isComplex: boolean
): Promise<void> {
  const labels = isComplex ? [...new Set([...issueLabels, "complex"])] : issueLabels;
  
  await octokit.request("PATCH /repos/{owner}/{repo}/issues/{issue_number}", {
    owner,
    repo,
    issue_number: issueNumber,
    labels,
  });

  const comment = isComplex
    ? `## Builder Assessment\n\nMarked as **complex**: ${reason}\n\nThis requires human review and detailed planning.`
    : `## Builder Assessment\n\nThis appears to be a **simple** implementable task.\n\nNote: ${reason}`;

  await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
    owner,
    repo,
    issue_number: issueNumber,
    body: comment,
  });
}

export async function runBuilder(): Promise<BuildResult> {
  const config = await loadConfig();
  const token = process.env.GH_TOKEN;

  if (!token) {
    return { success: false, error: "GH_TOKEN not set" };
  }

  if (!config.enabled) {
    return { success: false, error: "Builder is not enabled" };
  }

  const [owner, repoName] = config.github.repo.split("/");
  const octokit = new Octokit({ auth: token });

  console.log(`Fetching issues labeled: ${config.target_labels.join(", ")}`);
  const issues = await fetchBuildIssues(octokit, owner, repoName, config.target_labels);

  if (issues.length === 0) {
    console.log("No BUILD issues found");
    return { success: true, simple_count: 0, complex_count: 0 };
  }

  console.log(`Found ${issues.length} BUILD issue(s)`);

  let simpleCount = 0;
  let complexCount = 0;

  for (const issue of issues) {
    console.log(`\n=== Assessing #${issue.number}: ${issue.title}`);

    const { isComplex, reason } = assessComplexity(issue);

    await labelIssue(octokit, owner, repoName, issue.number, issue.labels, reason, isComplex);

    if (isComplex) {
      console.log(`  → COMPLEX: ${reason}`);
      complexCount++;
    } else {
      console.log(`  → SIMPLE: ${reason}`);
      simpleCount++;
    }
  }

  return { success: true, simple_count: simpleCount, complex_count: complexCount };
}

export async function main() {
  const result = await runBuilder();

  if (result.success) {
    console.log(`\n--- Done ---\nSimple: ${result.simple_count}\nComplex: ${result.complex_count}`);
  } else {
    console.error(result.error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}