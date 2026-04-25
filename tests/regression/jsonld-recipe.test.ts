import { describe, expect, it } from "vitest";

import { extractFirstJsonLdRecipeFromHtml } from "@/lib/url-import/jsonld-recipe";

describe("jsonld recipe ingredient dedupe", () => {
  it("dedupes obvious duplicates deterministically", () => {
    const html = `
      <html><head></head><body>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Recipe",
            "name": "Test Pasta",
            "recipeIngredient": [
              " 1 cup sugar ",
              "1 cup sugar",
              "1 CUP SUGAR.",
              "2 eggs"
            ]
          }
        </script>
      </body></html>
    `;

    const recipe = extractFirstJsonLdRecipeFromHtml(html);
    expect(recipe).not.toBeNull();
    expect(recipe?.ingredients).toEqual(["1 cup sugar", "2 eggs"]);
  });

  it("keeps materially different ingredient lines", () => {
    const html = `
      <html><head></head><body>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Recipe",
            "name": "Test Soup",
            "recipeIngredient": [
              "1 cup sugar",
              "2 cups sugar",
              "1 cup sugar, divided",
              "1 cup packed brown sugar"
            ]
          }
        </script>
      </body></html>
    `;

    const recipe = extractFirstJsonLdRecipeFromHtml(html);
    expect(recipe).not.toBeNull();
    expect(recipe?.ingredients).toEqual([
      "1 cup sugar",
      "2 cups sugar",
      "1 cup sugar, divided",
      "1 cup packed brown sugar",
    ]);
  });
});
