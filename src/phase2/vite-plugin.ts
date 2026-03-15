import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import _generate from "@babel/generator";
import * as t from "@babel/types";

const traverse = typeof _traverse === "function" ? _traverse : (_traverse as any).default;
const generate = typeof _generate === "function" ? _generate : (_generate as any).default;

/**
 * Transforms JSX source code to inject data-source attributes
 * on every JSX element. Used as a Vite plugin transform.
 * Returns the code unchanged for non-JSX files.
 */
export function injectDataSource(code: string, id: string): string {
  if (!id.match(/\.[jt]sx$/)) return code;

  const ast = parse(code, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });

  traverse(ast, {
    JSXOpeningElement(path: any) {
      const node = path.node;
      // Skip fragments (<> and <React.Fragment>)
      if (t.isJSXFragment(path.parent) || t.isJSXFragment(node)) return;
      if (t.isJSXIdentifier(node.name) && node.name.name === "Fragment") return;
      if (
        t.isJSXMemberExpression(node.name) &&
        t.isJSXIdentifier(node.name.property, { name: "Fragment" })
      ) return;
      // Skip actual fragment opening elements
      if (!node.name) return;

      const line = node.loc?.start.line;
      if (!line) return;

      // Don't add if already present
      const hasDataSource = node.attributes.some(
        (a: any) => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name, { name: "data-source" })
      );
      if (hasDataSource) return;

      node.attributes.push(
        t.jsxAttribute(
          t.jsxIdentifier("data-source"),
          t.stringLiteral(`${id}:${line}`)
        )
      );
    },
  });

  return generate(ast, { retainLines: true }, code).code;
}
