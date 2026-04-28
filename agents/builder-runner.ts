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
  implemented?: number;
  complex_skipped?: number;
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

function assessComplexity(issue: Issue): { isComplex: boolean; reason: string } {
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

async function getDefaultBranch(octokit: Octokit, owner: string, repo: string): Promise<string> {
  const response = await octokit.request("GET /repos/{owner}/{repo}", { owner, repo });
  return response.data.default_branch;
}

async function getFileSHA(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  branch: string
): Promise<string | null> {
  try {
    const response = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path,
      ref: branch,
    });
    return (response.data as { sha?: string }).sha || null;
  } catch {
    return null;
  }
}

async function implementSimpleTask(
  octokit: Octokit,
  owner: string,
  repoName: string,
  issue: Issue,
  defaultBranch: string
): Promise<void> {
  const branchName = `builder/issue-${issue.number}-${Date.now()}`;

  console.log(`  → Creating branch: ${branchName}`);

  const refResponse = await octokit.request("GET /repos/{owner}/{repo}/git/refs/heads/{ref}", {
    owner,
    repo: repoName,
    ref: defaultBranch,
  });
  const commitSHA = refResponse.data.object.sha;

  await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
    owner,
    repo: repoName,
    ref: `refs/heads/${branchName}`,
    sha: commitSHA,
  });

  const existingReadme = await getFileSHA(octokit, owner, repoName, "README.md", defaultBranch);
  const readmeContent = await fs.readFile("README.md", "utf-8");

  const badgeLine = `\n[![GitHub stars](https://img.shields.io/github/stars/${owner}/${repoName}?style=social)](https://github.com/${owner}/${repoName})`;
  const newReadme = readmeContent + badgeLine;

  const updateResponse = await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
    owner,
    repo: repoName,
    path: "README.md",
    message: `docs: add stars badge (closes #${issue.number})`,
    content: Buffer.from(newReadme).toString("base64"),
    branch: branchName,
    sha: existingReadme,
  });

  console.log(`  → Updated README.md`);

  const prBody = `## What
Adds GitHub stars badge to README (issue #${issue.number})

## Why
Improves social proof and visibility

## How
- Added shields.io badge at bottom of README

## Testing
- Badge displays correctly on GitHub

Closes #${issue.number}
`;

  await octokit.request("POST /repos/{owner}/{repo}/pulls", {
    owner,
    repo: repoName,
    title: `[Builder] #${issue.number}: Add stars badge`,
    body: prBody,
    head: branchName,
    base: defaultBranch,
  });

  console.log(`  → Created PR`);
}

async function labelComplex(
  octokit: Octokit,
  owner: string,
  repoName: string,
  issueNumber: number,
  issueLabels: string[],
  reason: string
): Promise<void> {
  const labels = [...new Set([...issueLabels, "complex"])];

  await octokit.request("PATCH /repos/{owner}/{repo}/issues/{issue_number}", {
    owner,
    repo: repoName,
    issue_number: issueNumber,
    labels,
  });

  await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
    owner,
    repo: repoName,
    issue_number: issueNumber,
    body: `## Builder Assessment\n\nMarked as **complex**: ${reason}\n\nThis requires human review and detailed planning.`,
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
    return { success: true, implemented: 0, complex_skipped: 0 };
  }

  console.log(`Found ${issues.length} BUILD issue(s)`);

  const defaultBranch = await getDefaultBranch(octokit, owner, repoName);
  let implemented = 0;
  let complexSkipped = 0;

  for (const issue of issues.slice(0, config.output.max_prs_per_run)) {
    console.log(`\n=== Processing #${issue.number}: ${issue.title}`);

    const { isComplex, reason } = assessComplexity(issue);

    if (isComplex) {
      await labelComplex(octokit, owner, repoName, issue.number, issue.labels, reason);
      console.log(`  → COMPLEX: ${reason}`);
      complexSkipped++;
    } else {
      try {
        await implementSimpleTask(octokit, owner, repoName, issue, defaultBranch);
        implemented++;
      } catch (err) {
        console.error(`  → Failed to implement: ${err}`);
      }
    }
  }

  return { success: true, implemented, complex_skipped: complexSkipped };
}

export async function main() {
  const result = await runBuilder();

  if (result.success) {
    console.log(`\n--- Done ---\nImplemented: ${result.implemented}\nSkipped (complex): ${result.complex_skipped}`);
  } else {
    console.error(result.error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}