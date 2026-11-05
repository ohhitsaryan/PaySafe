/**
 * StatusBadge
 * Shows a pulsing green dot when the agent is active, grey when paused.
 */
export default function StatusBadge({ active }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex items-center justify-center w-16 h-16">
        {active && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-50 animate-ping" />
        )}
        <span
          className={`relative inline-flex rounded-full w-12 h-12 ${
            active ? "bg-green-500" : "bg-gray-300"
          }`}
        />
      </div>
      <span
        className={`text-sm font-semibold ${
          active ? "text-green-600" : "text-gray-400"
        }`}
      >
        {active ? "Agent Active" : "Agent Paused"}
      </span>
    </div>
  );
}
