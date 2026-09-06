"use client";

import type { UIMessage } from "ai";

function allText(messages: UIMessage[]) {
  return messages
    .flatMap((message) => message.parts.filter((part) => part.type === "text").map((part) => part.type === "text" ? part.text : ""))
    .join(" ");
}

function findAirportCode(text: string, position: "origin" | "destination") {
  const codes = [...text.matchAll(/\b[A-Z]{3}\b/g)].map((match) => match[0]);
  if (codes.length === 0) return "Not set";
  return position === "origin" ? codes[0] : codes[1] ?? "Not set";
}

export function TripWorkspace({ messages }: { messages: UIMessage[] }) {
  const text = allText(messages);
  const origin = findAirportCode(text, "origin");
  const destination = findAirportCode(text, "destination");

  return (
    <aside className="workspace-panel">
      <div className="workspace-heading">
        <div><p className="eyebrow dark">Trip workspace</p><h2>{origin !== "Not set" || destination !== "Not set" ? `${origin} → ${destination}` : "New trip"}</h2></div>
        <span className="status-chip">Planning</span>
      </div>

      <div className="workspace-section">
        <h3>Trip intent</h3>
        <dl className="trip-fields">
          <div><dt>Origin</dt><dd>{origin}</dd></div>
          <div><dt>Destination</dt><dd>{destination}</dd></div>
          <div><dt>Departure window</dt><dd>Captured in conversation</dd></div>
          <div><dt>Destination stay</dt><dd>Captured in conversation</dd></div>
        </dl>
      </div>

      <div className="workspace-section">
        <div className="section-title-row"><h3>Discovery</h3><span className="muted-badge">Not run</span></div>
        <div className="empty-workspace"><strong>No hub results yet</strong><p>The next build stage connects this workspace to the existing Cuberence Discovery API.</p></div>
      </div>

      <div className="workspace-section">
        <div className="section-title-row"><h3>Pricing</h3><span className="muted-badge">Not run</span></div>
        <p className="workspace-note">Pricing becomes available after discovery and advisor hub selection.</p>
      </div>
    </aside>
  );
}
