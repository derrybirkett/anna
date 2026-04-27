import Link from "next/link";
import { getAllArticles } from "@/lib/content";

export default async function Home() {
  const articles = await getAllArticles();

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <main className="max-w-3xl mx-auto px-6 py-16">
        <header className="mb-16">
          <h1 className="text-4xl font-bold text-black dark:text-white mb-2">
            Systems Thinking
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Weekly explorations in systems thinking, complexity, and emergence
          </p>
        </header>

        {articles.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-zinc-500 dark:text-zinc-500">
              No articles yet. Check back soon!
            </p>
          </div>
        ) : (
          <div className="space-y-12">
            {articles.map((article) => (
              <article key={article.slug} className="border-b border-zinc-200 dark:border-zinc-800 pb-12">
                <Link href={`/article/${article.slug}`} className="group">
                  <time className="text-sm text-zinc-500 dark:text-zinc-500">
                    {new Date(article.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                  <h2 className="text-2xl font-semibold text-black dark:text-white mt-2 mb-3 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors">
                    {article.title}
                  </h2>
                  <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
                    {article.excerpt}...
                  </p>
                </Link>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
