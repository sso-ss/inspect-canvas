"use client";

export default function Navbar() {
  return (
    <nav className="flex items-center justify-between px-8 py-4 bg-white border-b border-gray-200">
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold text-gray-900">inspect-canvas</span>
        <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">demo</span>
      </div>
      <div className="flex items-center gap-6">
        <a href="#features" className="text-sm text-gray-600 hover:text-gray-900 font-medium">Features</a>
        <a href="#testimonials" className="text-sm text-gray-600 hover:text-gray-900 font-medium">Story</a>
        <a
          href="https://github.com"
          className="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-700"
        >
          GitHub
        </a>
      </div>
    </nav>
  );
}
