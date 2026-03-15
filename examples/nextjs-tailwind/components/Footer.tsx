"use client";

export default function Footer() {
  return (
    <footer className="px-8 py-12 bg-gray-900 text-gray-400">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-sm">inspect-canvas</span>
          <span className="text-gray-600 text-sm">·</span>
          <span className="text-sm">© {new Date().getFullYear()}</span>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <a
            href="https://github.com/sso/inspect-canvas"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            GitHub
          </a>
          <a
            href="#features"
            className="hover:text-white transition-colors"
          >
            Features
          </a>
          <a
            href="https://www.npmjs.com/package/inspect-canvas"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            npm
          </a>
        </div>
      </div>
    </footer>
  );
}
