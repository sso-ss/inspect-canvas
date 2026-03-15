"use client";

export default function Hero() {
  return (
    <section className="flex flex-col items-center text-center px-8 py-24 bg-white">
      <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
        <span>✦</span>
        <span>Figma-like browser inspector</span>
      </div>
      <h1 className="text-5xl font-bold text-gray-900 max-w-3xl leading-tight mb-6">
        Edit your design in the browser, not in code
      </h1>
      <p className="text-xl text-gray-500 max-w-2xl mb-10">
        Click any element. Change colours, fonts, spacing. Save back to your source files
        — without touching DevTools or going back to Figma.
      </p>
      <div className="flex items-center gap-4">
        <button className="bg-blue-600 text-white text-sm font-semibold px-6 py-3 rounded-xl hover:bg-blue-500" style={{ borderRadius: "20px" }}>
          Get started free
        </button>
        <button className="text-sm font-medium text-gray-600 px-6 py-3 rounded-xl border border-gray-200 hover:border-gray-400">
          See how it works →
        </button>
      </div>
      <div className="mt-16 w-full max-w-4xl bg-gray-950 rounded-2xl aspect-video flex items-center justify-center">
        <span className="text-gray-600 text-sm">[ Demo preview ]</span>
      </div>
    </section>);

}