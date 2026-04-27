import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";

const isVercel = !!process.env.VERCEL;
const CONTENT_DIR = path.join(process.cwd(), "content");
const TOPICS_FILE = path.join(CONTENT_DIR, "topics.txt");
const STATE_FILE = path.join(CONTENT_DIR, "state.json");
const PUBLISHED_DIR = isVercel
  ? path.join("/tmp", "published")
  : path.join(CONTENT_DIR, "published");

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export async function readTopics(): Promise<string[]> {
  const content = await fs.readFile(TOPICS_FILE, "utf-8");
  return content.split("\n").filter((line) => line.trim().length > 0);
}

export async function getCurrentTopic(): Promise<string> {
  const topics = await readTopics();
  const stateContent = await fs.readFile(STATE_FILE, "utf-8");
  const state = JSON.parse(stateContent);
  const index = state.currentIndex % topics.length;
  return topics[index];
}

export async function incrementTopicIndex(): Promise<void> {
  const stateContent = await fs.readFile(STATE_FILE, "utf-8");
  const state = JSON.parse(stateContent);
  state.currentIndex = (state.currentIndex + 1) % (await readTopics()).length;
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

export async function saveMarkdown(
  date: string,
  slug: string,
  filename: string,
  content: string
): Promise<void> {
  await fs.mkdir(PUBLISHED_DIR, { recursive: true });
  const dirPath = path.join(PUBLISHED_DIR, `${date}-${slug}`);
  await fs.mkdir(dirPath, { recursive: true });
  const filePath = path.join(dirPath, filename);
  await fs.writeFile(filePath, content, "utf-8");
}

export interface ArticleMetadata {
  slug: string;
  title: string;
  date: string;
  topic: string;
  excerpt: string;
}

export async function getAllArticles(): Promise<ArticleMetadata[]> {
  try {
    await fs.access(PUBLISHED_DIR);
  } catch {
    return [];
  }

  const dirs = await fs.readdir(PUBLISHED_DIR);
  const articles: ArticleMetadata[] = [];

  for (const dir of dirs) {
    if (dir === ".gitkeep") continue;

    const articlePath = path.join(PUBLISHED_DIR, dir, "article.md");
    try {
      const content = await fs.readFile(articlePath, "utf-8");
      const { data, content: body } = matter(content);

      const excerpt = body.replace(/^#.*$/gm, "").trim().slice(0, 200);

      articles.push({
        slug: dir,
        title: data.title || "Untitled",
        date: data.date || dir.split("-").slice(0, 3).join("-"),
        topic: data.topic || "",
        excerpt,
      });
    } catch (error) {
      console.error(`Error reading article ${dir}:`, error);
    }
  }

  return articles.sort((a, b) => b.date.localeCompare(a.date));
}

export async function getArticle(slug: string): Promise<{
  title: string;
  date: string;
  topic: string;
  content: string;
} | null> {
  const articlePath = path.join(PUBLISHED_DIR, slug, "article.md");

  try {
    const fileContent = await fs.readFile(articlePath, "utf-8");
    const { data, content } = matter(fileContent);

    return {
      title: data.title || "Untitled",
      date: data.date || "",
      topic: data.topic || "",
      content,
    };
  } catch (error) {
    return null;
  }
}
