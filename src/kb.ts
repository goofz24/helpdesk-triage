// The knowledge base (KB) the assistant may point users to.
// Articles live in kb/articles.json, each written in English and Spanish.
import articles from "../kb/articles.json" with { type: "json" };

export type KbArticle = {
  id: string;
  category: string;
  title_en: string;
  title_es: string;
  body_en: string;
  body_es: string;
};

export const KB_ARTICLES: KbArticle[] = articles;
export const KB_IDS = KB_ARTICLES.map((a) => a.id) as [string, ...string[]];

export function findArticle(id: string | null | undefined): KbArticle | undefined {
  return KB_ARTICLES.find((a) => a.id === id);
}

// One line per article, for the system prompt. Titles only: the model picks
// the article, our code pastes the real steps, so steps are never invented.
export function kbIndexForPrompt(): string {
  return KB_ARTICLES.map((a) => `- ${a.id} [${a.category}] ${a.title_en} / ${a.title_es}`).join("\n");
}
