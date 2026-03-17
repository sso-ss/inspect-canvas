cd examples/nextjs-tailwind
npm run devnode dist/cli.js http://localhost:3001 --port 3101 --output examples/nextjs-tailwind"use client";

const features = [
  {
    icon: "🖱️",
    title: "Click to select",
    description:
      "Click any element in the preview and its properties appear instantly — no digging through DevTools.",
  },
  {
    icon: "🎨",
    title: "Figma-style panel",
    description:
      "Colour picker, font size, spacing, border radius, layout — all the controls designers already know.",
  },
  {
    icon: "💾",
    title: "Writes back to source",
    description:
      "Hit Apply and your changes write directly to the JSX or CSS file. No copy-pasting, no regenerating.",
  },
  {
    icon: "🤖",
    title: "AI-ready",
    description:
      "Saves a .inspect-canvas.json file so GitHub Copilot and Claude know exactly what element to update.",
  },
  {
    icon: "⚛️",
    title: "React + Tailwind",
    description:
      "Understands Tailwind classes. Changes font-size 18px → adds text-lg, removes conflicting classes.",
  },
  {
    icon: "▲",
    title: "Next.js aware",
    description:
      "Skips RSC and server action files automatically. Patches client components and triggers HMR.",
  },
];

export default function Features() {
  return (
    <section id="features" className="px-8 py-24 bg-gray-50">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">
          Everything designers need
        </h2>
        <p className="text-gray-500 text-center mb-16 text-lg">
          Built for the gap between Figma and DevTools.
        </p>
        <div className="grid grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="bg-white rounded-2xl p-6 border border-gray-200">
              <div className="text-2xl mb-4">{f.icon}</div>
              <h3 className="text-base font-semibold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
