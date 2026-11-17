import { Phone } from "lucide-react";

export const HELPLINES = [
  { label: "Emergency", number: "112", hours: "24x7" },
  { label: "Disaster Helpline", number: "1070", hours: "24x7" },
  { label: "Women Safety", number: "1091", hours: "24x7" },
];

export default function HelplineTicker() {
  return (
    <div
      role="region"
      aria-label="Emergency helplines"
      className="bg-red-700 text-xs text-white"
    >
      <ul className="mx-auto flex max-w-7xl items-center gap-6 overflow-x-auto px-4 py-1.5">
        {HELPLINES.map(({ label, number, hours }) => (
          <li key={number} className="shrink-0">
            <a
              href={`tel:${number}`}
              aria-label={`Call ${label} on ${number}, available ${hours}`}
              className="inline-flex items-center gap-1.5 rounded px-1 font-medium hover:underline focus-visible:outline-2 focus-visible:outline-white"
            >
              <Phone size={12} aria-hidden="true" />
              {label}: <strong>{number}</strong>
              <span className="opacity-80">({hours})</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}