import assert from "node:assert/strict";
import test from "node:test";
import { highlightArtifact, prepareCodeView } from "../scripts/highlight.ts";

test("Shiki token ranges preserve BOM, CRLF, Unicode and trailing whitespace", async () => {
  const source =
    '\uFEFF<!doctype html>\r\n<style>body { color: red; }</style>\r\n<script>const animal = "🐹";</script>\r\n  \r\n';
  const result = await highlightArtifact(source, "html", "checksum");
  assert.equal(result.sha256, "checksum");
  assert.ok(result.tokens.length > 10);
  for (const name of ["color", "animal"]) {
    const token = result.tokens.find((token) => token.offset === source.indexOf(name));
    assert.equal(token?.length, name.length);
  }
  assert.ok(new Set(result.tokens.map((token) => token.light)).size > 3);
  let offset = 0;
  let reconstructed = "";
  for (const token of result.tokens) {
    assert.ok(token.offset >= offset);
    assert.ok(token.length > 0);
    assert.match(token.light, /^#[\da-f]{6}$/i);
    assert.match(token.dark, /^#[\da-f]{6}$/i);
    reconstructed += source.slice(offset, token.offset);
    reconstructed += source.slice(token.offset, token.offset + token.length);
    offset = token.offset + token.length;
  }
  assert.equal(reconstructed + source.slice(offset), source);
});

test("formatted HTML separates markup, CSS declarations and JavaScript blocks", async () => {
  const source =
    '<!doctype html><html><head><style>body{margin:0;color:red}</style></head><body><script>function greet(){const message="hi";return message;}</script></body></html>';
  const result = await prepareCodeView(source, "html", "original-checksum");
  assert.equal(result.sha256, "original-checksum");
  assert.ok(result.formatted);
  assert.match(result.formatted.source, /\n {2}<head>\n/);
  assert.match(result.formatted.source, /body \{\n\s+margin: 0;\n\s+color: red;/);
  assert.match(result.formatted.source, /function greet\(\) \{\n\s+const message = "hi";/);
  assert.ok(result.formatted.source.split("\n").length > 15);
  assert.ok(result.formatted.tokens.length > 10);
});

test("invalid HTML scripts stay inspectable without repairing the original", async () => {
  const source = "<html><script>const = ;</script></html>";
  const result = await prepareCodeView(source, "html", "checksum");
  assert.ok(result.formatted);
  assert.match(result.formatted.source, /const = ;/);
  assert.equal(result.sha256, "checksum");
  assert.ok(result.tokens.length > 0);
});

test("formatting failures preserve highlighted original evidence", async () => {
  const result = await prepareCodeView("<html><div></span></html>", "html", "checksum");
  assert.equal(result.formatted, null);
  assert.equal(result.sha256, "checksum");
  assert.ok(result.tokens.length > 0);
});

test("original response text is never beautified", async () => {
  const result = await prepareCodeView("An unedited response.\n", "markdown", "checksum");
  assert.equal(result.formatted, null);
});

test("Markdown responses highlight embedded code and empty artifacts remain valid", async () => {
  const result = await highlightArtifact(
    'Here is the code:\n```html\n<a href="/">test</a>\n```\n',
    "markdown",
    "checksum",
  );
  assert.ok(new Set(result.tokens.map((token) => token.light)).size > 1);
  assert.deepEqual(await highlightArtifact("", "html", "empty"), { sha256: "empty", tokens: [] });
});
