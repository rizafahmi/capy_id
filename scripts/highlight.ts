import { format } from "prettier";
import { codeToTokens } from "shiki";

// Store token ranges, not HTML. The viewer applies colors through text nodes.
export async function highlightArtifact(source: string, lang: "html" | "markdown", sha256: string) {
  const result = await codeToTokens(source, {
    lang,
    themes: { light: "github-light", dark: "github-dark" },
  });
  return {
    sha256,
    tokens: result.tokens.flat().flatMap((token) =>
      token.content.length === 0
        ? []
        : [
            {
              offset: token.offset,
              length: token.content.length,
              light: String(token.htmlStyle?.color ?? "#24292e"),
              dark: String(token.htmlStyle?.["--shiki-dark"] ?? "#e1e4e8"),
            },
          ],
    ),
  };
}

export async function prepareCodeView(source: string, lang: "html" | "markdown", sha256: string) {
  const original = await highlightArtifact(source, lang, sha256);
  let formatted: { source: string; tokens: typeof original.tokens } | null = null;
  if (lang === "html") {
    try {
      const readable = await format(source, {
        parser: "html",
        tabWidth: 2,
        useTabs: false,
        printWidth: 80,
        htmlWhitespaceSensitivity: "ignore",
        embeddedLanguageFormatting: "auto",
      });
      const highlighted = await highlightArtifact(readable, lang, sha256);
      formatted = { source: readable, tokens: highlighted.tokens };
    } catch {
      // Invalid generated code stays readable as original evidence, never repaired or executed.
    }
  }
  return { ...original, formatted };
}
