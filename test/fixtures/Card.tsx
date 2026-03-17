export function Card() {
  return (
    <div className="rounded-lg shadow-md" style={{ maxWidth: 400 }}>
      <img className="w-full" src="/hero.png" alt="Hero" />
      <div className="p-6">
        <h2 className="text-xl font-semibold">Card Title</h2>
        <p style={{ color: "#666", lineHeight: 1.6 }}>
          Card description text goes here.
        </p>
      </div>
    </div>
  );
}
