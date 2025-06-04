export default function ToolsPage() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">AI Tools</h1>
      <p>A grid of available AI tools will be displayed here.</p>
      {/* Placeholder for AI tool cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        <div className="border p-4 rounded-lg shadow">
          <h2 className="text-xl font-semibold">Tool 1</h2>
          <p className="text-sm text-muted-foreground">Description of Tool 1</p>
        </div>
        <div className="border p-4 rounded-lg shadow">
          <h2 className="text-xl font-semibold">Tool 2</h2>
          <p className="text-sm text-muted-foreground">Description of Tool 2</p>
        </div>
        <div className="border p-4 rounded-lg shadow">
          <h2 className="text-xl font-semibold">Tool 3</h2>
          <p className="text-sm text-muted-foreground">Description of Tool 3</p>
        </div>
      </div>
    </div>
  );
} 