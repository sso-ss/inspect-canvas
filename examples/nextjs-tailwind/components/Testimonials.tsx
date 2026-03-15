"use client";

const testimonials = [
  {
    quote:
      "I used to spend 30 minutes in DevTools every time the AI got a padding slightly wrong. Now I just click it and change it. It's insane how much time this saves.",
    name: "Priya K.",
    role: "Product Designer, early user",
  },
  {
    quote:
      "The AI generates 90% of the UI perfectly. inspect-canvas handles the last 10% — the tweaks that used to require a developer.",
    name: "Marco L.",
    role: "Indie hacker",
  },
  {
    quote:
      "I hand this to designers and they stop pinging me for every colour change. My PR queue is so much quieter.",
    name: "Soo H.",
    role: "Frontend engineer",
  },
];

export default function Testimonials() {
  return (
    <section className="px-8 py-24 bg-white">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">
          What people are saying
        </h2>
        <p className="text-gray-500 text-center mb-16 text-lg">
          From designers tired of waiting, and engineers tired of being pinged.
        </p>
        <div className="grid grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="flex flex-col justify-between bg-gray-50 rounded-2xl p-8 border border-gray-200"
            >
              <p className="text-gray-700 text-sm leading-relaxed mb-6">"{t.quote}"</p>
              <div>
                <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
