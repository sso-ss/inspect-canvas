export function Nested() {
  return (
    <main className="min-h-screen">
      <header className="bg-white shadow">
        <nav className="flex items-center justify-between px-6 py-4">
          <a className="text-lg font-bold" href="/">Logo</a>
          <ul className="flex gap-4">
            <li><a href="/about">About</a></li>
            <li><a href="/contact">Contact</a></li>
          </ul>
        </nav>
      </header>
      <div className="container mx-auto p-8">
        <h1 className="text-4xl font-bold mb-4">Welcome</h1>
        <p className="text-gray-600">Nested content here.</p>
      </div>
    </main>
  );
}
