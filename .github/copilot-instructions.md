# inspect-canvas Integration

When the user says "update this element", "change this", "fix this", or similar requests about a UI element:

1. Read `.inspect-canvas.json` in the project root
2. It contains the selected element's details:
   - `tag` — HTML tag name
   - `selector` — CSS selector path to the element
   - `styles` — current computed styles
   - `text` — visible text content
   - `size` — rendered width/height
   - `instruction` — what the user wants changed (if provided)
3. Find the source file that renders this element
4. Apply the requested change to the source code

If `instruction` is present, follow it. If not, ask the user what they'd like to change.
