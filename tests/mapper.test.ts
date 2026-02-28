import { describe, it, expect } from "vitest";
import { htmlToCommands } from "../src/index.js";

describe("htmlToCommands", () => {
  it("converts a simple div with text", () => {
    const cmds = htmlToCommands("<div>Hello</div>");
    expect(cmds.length).toBeGreaterThan(0);
    // First command should be create_frame for the div
    expect(cmds[0].command).toBe("create_frame");
    expect(cmds[0].params.name).toBe("div");
    // Second should be create_text for "Hello"
    const textCmd = cmds.find((c) => c.command === "create_text");
    expect(textCmd).toBeDefined();
    expect(textCmd!.params.content).toBe("Hello");
  });

  it("converts a paragraph", () => {
    const cmds = htmlToCommands("<p>Some text</p>");
    // p is a text block tag -> create_text
    expect(cmds).toHaveLength(1);
    expect(cmds[0].command).toBe("create_text");
    expect(cmds[0].params.content).toBe("Some text");
  });

  it("converts headings with correct font size", () => {
    const cmds = htmlToCommands("<h1>Title</h1>");
    expect(cmds).toHaveLength(1);
    expect(cmds[0].command).toBe("create_text");
    expect(cmds[0].params.fontWeight).toBe(700);
    expect(cmds[0].params.fontSize).toBe(32); // h1 default
  });

  it("converts a button", () => {
    const cmds = htmlToCommands('<button>Click me</button>');
    // button -> create_frame + create_text
    const frameCmd = cmds.find((c) => c.command === "create_frame");
    const textCmd = cmds.find((c) => c.command === "create_text");
    expect(frameCmd).toBeDefined();
    expect(textCmd).toBeDefined();
    expect(textCmd!.params.content).toBe("Click me");
  });

  it("applies inline styles", () => {
    const cmds = htmlToCommands('<div style="background-color: #ff0000; padding: 16px">Red</div>');
    const frame = cmds[0];
    expect(frame.command).toBe("create_frame");
    expect(frame.params.fillColor).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(frame.params.paddingTop).toBe(16);
  });

  it("applies external CSS from styles option", () => {
    const cmds = htmlToCommands('<div class="card">Content</div>', {
      styles: ".card { background-color: blue; padding: 24px; }",
    });
    const frame = cmds[0];
    expect(frame.command).toBe("create_frame");
    expect(frame.params.paddingTop).toBe(24);
  });

  it("handles nested elements", () => {
    const cmds = htmlToCommands(`
      <div style="display:flex; gap:16px">
        <p>Item 1</p>
        <p>Item 2</p>
      </div>
    `);
    const frame = cmds[0];
    expect(frame.params.autoLayout).toBeDefined();
    expect(frame.params.itemSpacing).toBe(16);
    // Should have text children
    const texts = cmds.filter((c) => c.command === "create_text");
    expect(texts).toHaveLength(2);
  });

  it("converts images to rectangles", () => {
    const cmds = htmlToCommands('<img src="test.png" width="200" height="100" alt="Test" />');
    // create_rectangle + set_image_fill for http images; here src is relative so only rectangle
    const rects = cmds.filter((c) => c.command === "create_rectangle");
    expect(rects).toHaveLength(1);
    expect(rects[0].params.name).toBe("img: Test (test.png)");
    expect(rects[0].params.width).toBe(200);
    expect(rects[0].params.height).toBe(100);
  });

  it("converts hr to separator frame", () => {
    const cmds = htmlToCommands("<div><hr /></div>");
    const hr = cmds.find((c) => c.params.name === "hr");
    expect(hr).toBeDefined();
    expect(hr!.command).toBe("create_frame");
    expect(hr!.params.height).toBe(1);
  });

  it("skips display:none elements", () => {
    const cmds = htmlToCommands('<div style="display:none">Hidden</div>');
    expect(cmds).toHaveLength(0);
  });

  it("handles flexbox row direction", () => {
    const cmds = htmlToCommands('<div style="display:flex; flex-direction:row">Row</div>');
    const frame = cmds[0];
    expect(frame.params.autoLayout).toBe("HORIZONTAL");
  });

  it("handles flexbox column direction", () => {
    const cmds = htmlToCommands('<div style="display:flex; flex-direction:column">Column</div>');
    const frame = cmds[0];
    expect(frame.params.autoLayout).toBe("VERTICAL");
  });

  it("handles border-radius", () => {
    const cmds = htmlToCommands('<div style="border-radius: 12px">Rounded</div>');
    expect(cmds[0].params.cornerRadius).toBe(12);
  });

  it("handles opacity", () => {
    const cmds = htmlToCommands('<div style="opacity: 0.5">Faded</div>');
    expect(cmds[0].params.opacity).toBe(0.5);
  });

  it("handles overflow hidden", () => {
    const cmds = htmlToCommands('<div style="overflow: hidden">Clipped</div>');
    expect(cmds[0].params.clipsContent).toBe(true);
  });

  it("generates $ref for child parentId", () => {
    const cmds = htmlToCommands("<div><p>Nested</p></div>");
    const textCmd = cmds.find((c) => c.command === "create_text");
    expect(textCmd!.params.parentId).toBe("$ref:0");
  });

  it("handles lists", () => {
    const cmds = htmlToCommands("<ul><li>Item 1</li><li>Item 2</li></ul>");
    // ul -> frame, li -> frame each with bullet + text
    const frames = cmds.filter((c) => c.command === "create_frame");
    expect(frames.length).toBeGreaterThanOrEqual(3); // ul + 2x li
  });

  it("handles scale option", () => {
    const cmds = htmlToCommands('<p style="font-size: 16px">Scaled</p>', { scale: 2 });
    expect(cmds[0].params.fontSize).toBe(32);
  });

  it("handles an input element", () => {
    const cmds = htmlToCommands('<input type="text" placeholder="Enter name" />');
    const frame = cmds.find((c) => c.command === "create_frame");
    const text = cmds.find((c) => c.command === "create_text");
    expect(frame).toBeDefined();
    expect(text).toBeDefined();
    expect(text!.params.content).toBe("Enter name");
  });

  it("converts style blocks", () => {
    const cmds = htmlToCommands(`
      <style>
        .box { background-color: #3B82F6; padding: 20px; border-radius: 8px; }
      </style>
      <div class="box">Blue Box</div>
    `);
    const frame = cmds[0];
    expect(frame.command).toBe("create_frame");
    expect(frame.params.fillColor).toBeDefined();
    expect(frame.params.paddingTop).toBe(20);
    expect(frame.params.cornerRadius).toBe(8);
  });

  it("handles empty input", () => {
    const cmds = htmlToCommands("");
    expect(cmds).toHaveLength(0);
  });
});

describe("htmlToCommands — complex patterns", () => {
  it("converts a card component", () => {
    const cmds = htmlToCommands(`
      <div style="display:flex; flex-direction:column; padding:24px; gap:16px; background-color:#ffffff; border-radius:12px; border:1px solid #E5E7EB">
        <h2 style="font-size:20px; font-weight:600; color:#111827">Card Title</h2>
        <p style="font-size:14px; color:#6B7280">Card description text goes here.</p>
        <button style="background-color:#3B82F6; color:#ffffff; padding:8px 16px; border-radius:8px; font-size:14px">Action</button>
      </div>
    `);
    // Should have:
    // - Root frame (div)
    // - H2 text
    // - P text
    // - Button frame + text
    expect(cmds.length).toBeGreaterThanOrEqual(4);

    const rootFrame = cmds[0];
    expect(rootFrame.command).toBe("create_frame");
    expect(rootFrame.params.autoLayout).toBe("VERTICAL");
    expect(rootFrame.params.paddingTop).toBe(24);
    expect(rootFrame.params.itemSpacing).toBe(16);
    expect(rootFrame.params.cornerRadius).toBe(12);
  });
});

describe("htmlToCommands — text-transform", () => {
  it("applies text-transform: uppercase to text content", () => {
    const cmds = htmlToCommands('<p style="text-transform: uppercase">hello world</p>');
    expect(cmds[0].params.content).toBe("HELLO WORLD");
  });

  it("applies text-transform: lowercase to text content", () => {
    const cmds = htmlToCommands('<p style="text-transform: lowercase">Hello World</p>');
    expect(cmds[0].params.content).toBe("hello world");
  });

  it("applies text-transform: capitalize to text content", () => {
    const cmds = htmlToCommands('<p style="text-transform: capitalize">hello world</p>');
    expect(cmds[0].params.content).toBe("Hello World");
  });

  it("applies text-transform to inline text elements", () => {
    const cmds = htmlToCommands('<span style="text-transform: uppercase">test</span>');
    expect(cmds[0].params.content).toBe("TEST");
  });
});

describe("htmlToCommands — font-style", () => {
  it("passes italic flag for font-style: italic", () => {
    const cmds = htmlToCommands('<p style="font-style: italic">Italic text</p>');
    expect(cmds[0].params.italic).toBe(true);
  });

  it("does not set italic for normal font-style", () => {
    const cmds = htmlToCommands('<p>Normal text</p>');
    expect(cmds[0].params.italic).toBeUndefined();
  });
});

describe("htmlToCommands — SVG handling", () => {
  it("converts svg to a sized placeholder frame", () => {
    const cmds = htmlToCommands('<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>');
    expect(cmds.length).toBeGreaterThanOrEqual(1);
    expect(cmds[0].command).toBe("create_frame");
    expect(cmds[0].params.name).toBe("svg");
  });
});

describe("htmlToCommands — background gradient", () => {
  it("extracts first color from linear-gradient as fallback", () => {
    const cmds = htmlToCommands('<div style="background-image: linear-gradient(rgba(255,0,0,1), rgba(0,0,255,1))">Gradient</div>');
    const frame = cmds[0];
    expect(frame.params.fillColor).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });

  it("extracts color from background shorthand gradient", () => {
    const cmds = htmlToCommands('<div style="background: linear-gradient(rgba(0,128,0,1), rgba(0,0,255,1))">Gradient</div>');
    const frame = cmds[0];
    // Should extract the first rgba color
    expect(frame.params.fillColor.g).toBeCloseTo(0.502, 1);
  });
});

describe("htmlToCommands — image improvements", () => {
  it("uses data-width/data-height for image dimensions", () => {
    const cmds = htmlToCommands('<img data-width="300" data-height="200" alt="photo" />');
    const rect = cmds.find(c => c.command === "create_rectangle");
    expect(rect).toBeDefined();
    expect(rect!.params.width).toBe(300);
    expect(rect!.params.height).toBe(200);
  });

  it("includes image src URL in name", () => {
    const cmds = htmlToCommands('<img data-src="https://example.com/photo.jpg" alt="My Photo" />');
    const rect = cmds.find(c => c.command === "create_rectangle");
    expect(rect).toBeDefined();
    expect(rect!.params.name).toContain("photo.jpg");
    expect(rect!.params.name).toContain("My Photo");
  });
});
