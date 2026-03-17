import { describe, it, expect } from "vitest";
import { injectDataSource } from "../src/phase2/vite-plugin";

describe("vite-plugin: data-source injection", () => {
  it("injects data-source on a simple JSX element", () => {
    const code = `
export function Hero() {
  return <div className="p-4">Hello</div>;
}`;
    const result = injectDataSource(code, "src/Hero.tsx");
    expect(result).toContain('data-source="src/Hero.tsx:3"');
  });

  it("injects data-source on every JSX element with correct line numbers", () => {
    const code = `export function App() {
  return (
    <div>
      <h1>Title</h1>
      <p>Body</p>
    </div>
  );
}`;
    const result = injectDataSource(code, "src/App.tsx");
    expect(result).toContain('data-source="src/App.tsx:3"');
    expect(result).toContain('data-source="src/App.tsx:4"');
    expect(result).toContain('data-source="src/App.tsx:5"');
  });

  it("does not inject into Fragment shorthand (<>)", () => {
    const code = `export function Frag() {
  return (
    <>
      <p>Inside fragment</p>
    </>
  );
}`;
    const result = injectDataSource(code, "src/Frag.tsx");
    expect(result).not.toMatch(/data-source="src\/Frag\.tsx:3"/);
    expect(result).toContain('data-source="src/Frag.tsx:4"');
  });

  it("skips non-JSX files", () => {
    const cssCode = `.hero { color: red; }`;
    const result = injectDataSource(cssCode, "src/styles.css");
    expect(result).toBe(cssCode);
  });

  it("handles self-closing elements", () => {
    const code = `export function Img() {
  return <img src="/photo.png" />;
}`;
    const result = injectDataSource(code, "src/Img.tsx");
    expect(result).toContain('data-source="src/Img.tsx:2"');
    expect(result).toContain("/>");
  });

  it("preserves existing props", () => {
    const code = `export function Button() {
  return <button onClick={handleClick} className="btn">Click</button>;
}`;
    const result = injectDataSource(code, "src/Button.tsx");
    expect(result).toContain("onClick={handleClick}");
    expect(result).toContain('className="btn"');
    expect(result).toContain('data-source="src/Button.tsx:2"');
  });

  it("handles JSX files (.jsx)", () => {
    const code = `export function Plain() {
  return <div>Hello</div>;
}`;
    const result = injectDataSource(code, "src/Plain.jsx");
    expect(result).toContain('data-source="src/Plain.jsx:2"');
  });

  it("injects into conditional JSX expressions", () => {
    const code = `export function Cond({ show }) {
  return (
    <div>
      {show && <span>Visible</span>}
    </div>
  );
}`;
    const result = injectDataSource(code, "src/Cond.tsx");
    expect(result).toContain('data-source="src/Cond.tsx:3"');
    expect(result).toContain('data-source="src/Cond.tsx:4"');
  });
});
