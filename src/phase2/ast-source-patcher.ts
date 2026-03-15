import { readFileSync } from "node:fs";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import _generate from "@babel/generator";
import type { JSXOpeningElement, JSXAttribute, StringLiteral } from "@babel/types";
import * as t from "@babel/types";

// Handle CJS/ESM interop
const traverse = typeof _traverse === "function" ? _traverse : (_traverse as any).default;
const generate = typeof _generate === "function" ? _generate : (_generate as any).default;

export interface PatchOptions {
  filePath: string;
  line: number;
  addClasses?: string[];
  removeClasses?: string[];
  setStyles?: Record<string, string>;
}

/**
 * Parses a JSX/TSX file, finds the element at the given line,
 * modifies className and/or style props, and returns the patched source.
 */
export function patchJsxSource(options: PatchOptions): string {
  const { filePath, line, addClasses, removeClasses, setStyles } = options;

  const source = readFileSync(filePath, "utf-8");
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });

  let found = false;

  traverse(ast, {
    JSXOpeningElement(path: any) {
      const loc = path.node.loc;
      if (!loc || loc.start.line !== line) return;
      found = true;

      const opening: JSXOpeningElement = path.node;

      // ── className modifications ──
      if (addClasses?.length || removeClasses?.length) {
        let classAttr = opening.attributes.find(
          (a): a is JSXAttribute =>
            t.isJSXAttribute(a) && t.isJSXIdentifier(a.name, { name: "className" })
        );

        let classes: string[] = [];
        if (classAttr && t.isStringLiteral(classAttr.value)) {
          classes = classAttr.value.value.split(/\s+/).filter(Boolean);
        }

        if (removeClasses) {
          classes = classes.filter(c => !removeClasses.includes(c));
        }
        if (addClasses) {
          for (const cls of addClasses) {
            if (!classes.includes(cls)) classes.push(cls);
          }
        }

        const newValue = classes.join(" ");
        if (classAttr) {
          classAttr.value = t.stringLiteral(newValue);
        } else {
          opening.attributes.push(
            t.jsxAttribute(t.jsxIdentifier("className"), t.stringLiteral(newValue))
          );
        }
      }

      // ── style modifications ──
      if (setStyles && Object.keys(setStyles).length > 0) {
        let styleAttr = opening.attributes.find(
          (a): a is JSXAttribute =>
            t.isJSXAttribute(a) && t.isJSXIdentifier(a.name, { name: "style" })
        );

        const newProps: t.ObjectProperty[] = [];

        // Collect existing style properties
        if (
          styleAttr &&
          t.isJSXExpressionContainer(styleAttr.value) &&
          t.isObjectExpression(styleAttr.value.expression)
        ) {
          const existing = styleAttr.value.expression;
          for (const prop of existing.properties) {
            if (t.isObjectProperty(prop)) {
              const key = t.isIdentifier(prop.key) ? prop.key.name : undefined;
              if (key && !(key in setStyles)) {
                newProps.push(prop);
              }
            }
          }
        }

        // Add new/updated styles
        for (const [key, val] of Object.entries(setStyles)) {
          const valueNode =
            typeof val === "string" ? t.stringLiteral(val) : t.numericLiteral(Number(val));
          newProps.push(t.objectProperty(t.identifier(key), valueNode));
        }

        const styleExpr = t.jsxExpressionContainer(t.objectExpression(newProps));

        if (styleAttr) {
          styleAttr.value = styleExpr;
        } else {
          opening.attributes.push(
            t.jsxAttribute(t.jsxIdentifier("style"), styleExpr)
          );
        }
      }
    },
  });

  if (!found) {
    throw new Error(`No JSX element found at line ${line} in ${filePath}`);
  }

  return generate(ast, { retainLines: true }, source).code;
}
