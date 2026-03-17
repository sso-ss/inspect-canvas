import { describe, it, expect } from "vitest";
import { transformWithDataSource } from "../src/phase2/babel-plugin";

describe("babel-plugin: data-source injection", () => {
  it("injects data-source into JSX elements", () => {
    const code = `export function Hero() {
  return <div className="p-4">Hello</div>;
}`;
    const result = transformWithDataSource(code, "src/Hero.tsx");
    expect(result).toContain("data-source");
    expect(result).toContain("src/Hero.tsx");
  });

  it("handles TypeScript syntax without errors", () => {
    const code = `interface Props {
  title: string;
  count: number;
}

export function Card({ title, count }: Props) {
  return (
    <div>
      <h2>{title}</h2>
      <span>{count}</span>
    </div>
  );
}`;
    const result = transformWithDataSource(code, "src/Card.tsx");
    expect(result).toContain("data-source");
  });

  it("works with plain .jsx (no TypeScript)", () => {
    const code = `export function App() {
  return <main><p>Hello</p></main>;
}`;
    const result = transformWithDataSource(code, "src/App.jsx");
    expect(result).toContain("data-source");
  });

  it("assigns correct line numbers", () => {
    const code = `function Multi() {
  return (
    <div>
      <h1>Line 4</h1>
      <p>Line 5</p>
    </div>
  );
}`;
    const result = transformWithDataSource(code, "src/Multi.tsx");
    expect(result).toContain("src/Multi.tsx:");
  });

  it("does not inject into React.Fragment or <>", () => {
    const code = `export function Frag() {
  return (
    <>
      <p>Inside</p>
    </>
  );
}`;
    const result = transformWithDataSource(code, "src/Frag.tsx");
    const matches = result.match(/data-source/g) || [];
    expect(matches.length).toBe(1);
  });

  it("preserves component logic and hooks", () => {
    const code = `import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <span>{count}</span>
      <button onClick={() => setCount(c => c + 1)}>+1</button>
    </div>
  );
}`;
    const result = transformWithDataSource(code, "src/Counter.tsx");
    expect(result).toContain("useState");
    expect(result).toContain("setCount");
    expect(result).toContain("data-source");
  });
});
