import { notFound } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getArticle } from "@/lib/content";

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getArticle(slug);

  if (!article) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <article className="max-w-3xl mx-auto px-6 py-16">
        <Link
          href="/"
          className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white mb-8 inline-block"
        >
          ← Back to articles
        </Link>

        <header className="mb-12">
          <time className="text-sm text-zinc-500 dark:text-zinc-500">
            {new Date(article.date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
          <h1 className="text-4xl font-bold text-black dark:text-white mt-2">
            {article.title}
          </h1>
        </header>

        <div className="prose prose-zinc dark:prose-invert max-w-none prose-headings:font-semibold prose-a:text-black dark:prose-a:text-white prose-a:no-underline hover:prose-a:underline">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {article.content.replace(/^#\s+.+$/m, "")}
          </ReactMarkdown>
        </div>
      </article>
    </div>
  );
}
