import { transformSync } from "@babel/core";
import type { PluginObj } from "@babel/core";

function dataSourcePlugin(filename: string): () => PluginObj {
  return function (): PluginObj {
    return {
      visitor: {
        JSXOpeningElement(path: any) {
          const node = path.node;
          const t = path.hub.file.opts.caller
            ? require("@babel/types")
            : require("@babel/types");

          // Skip fragments
          if (!node.name) return;
          const { types: bt } = require("@babel/core");

          if (bt.isJSXIdentifier(node.name) && node.name.name === "Fragment") return;
          if (
            bt.isJSXMemberExpression(node.name) &&
            bt.isJSXIdentifier(node.name.property, { name: "Fragment" })
          ) return;

          const line = node.loc?.start.line;
          if (!line) return;

          const hasDataSource = node.attributes.some(
            (a: any) =>
              bt.isJSXAttribute(a) && bt.isJSXIdentifier(a.name, { name: "data-source" })
          );
          if (hasDataSource) return;

          node.attributes.push(
            bt.jsxAttribute(
              bt.jsxIdentifier("data-source"),
              bt.stringLiteral(`${filename}:${line}`)
            )
          );
        },
      },
    };
  };
}

/**
 * Default export — used when referenced from .babelrc:
 *   "plugins": [["../../dist/babel-plugin.cjs"]]
 *
 * Babel calls this function with ({ types }) and the plugin return value
 * is { visitor: { JSXOpeningElement } }.
 */
export default function inspectCanvasPlugin({ types: t }: any): PluginObj {
  return {
    visitor: {
      JSXOpeningElement(path: any, state: any) {
        const filename: string = state.filename || state.file?.opts?.filename || "";
        const node = path.node;

        if (!node.name) return;
        if (t.isJSXIdentifier(node.name) && node.name.name === "Fragment") return;
        if (
          t.isJSXMemberExpression(node.name) &&
          t.isJSXIdentifier(node.name.property, { name: "Fragment" })
        ) return;

        const line: number | undefined = node.loc?.start.line;
        if (!line) return;

        const hasDataSource = node.attributes.some(
          (a: any) =>
            t.isJSXAttribute(a) && t.isJSXIdentifier(a.name, { name: "data-source" })
        );
        if (hasDataSource) return;

        node.attributes.push(
          t.jsxAttribute(
            t.jsxIdentifier("data-source"),
            t.stringLiteral(`${filename}:${line}`)
          )
        );
      },
    },
  };
}

/**
 * Babel transform that injects data-source attributes into JSX elements.
 * Wraps @babel/core transformSync with the data-source plugin.
 */
export function transformWithDataSource(code: string, filename: string): string {
  const isTsx = filename.endsWith(".tsx");

  const result = transformSync(code, {
    filename,
    plugins: [dataSourcePlugin(filename)],
    presets: isTsx ? [["@babel/preset-typescript", { isTSX: true, allExtensions: true }]] : [],
    parserOpts: {
      plugins: ["jsx", ...(isTsx ? ["typescript" as const] : [])],
    },
    retainLines: true,
  });

  return result?.code ?? code;
}
