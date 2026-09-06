"use client";

import type { UIMessage } from "ai";

function allText(messages: UIMessage[]) {
  return messages.flatMap((message) => message.parts.filter((part) => part.type === "text").map((part) => part.type === "text" ? part.text : "")).join(" ");
}
function findAirportCode(text: string, position: "origin" | "destination") {
  const codes = [...text.matchAll(/\b[A-Z]{3}\b/g)].map((match) => match[0]);
  if (codes.length === 0) return "Not set";
  return position === "origin" ? codes[0] : codes[1] ?? "Not set";
}
function latestDiscovery(messages: UIMessage[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const parts = messages[i].parts as any[];
    for (let p = parts.length - 1; p >= 0; p -= 1) {
      if (parts[p].type === "tool-discovery" && parts[p].output) return parts[p].output as any;
    }
  }
  return null;
}

export function TripWorkspace({ messages }: { messages: UIMessage[] }) {
  const text = allText(messages); const origin = findAirportCode(text, "origin"); const destination = findAirportCode(text, "destination");
  const discovery = latestDiscovery(messages); const hubs = Array.isArray(discovery?.hubs) ? discovery.hubs : [];
  return <aside className="workspace-panel">
    <div className="workspace-heading"><div><p className="eyebrow dark">Trip workspace</p><h2>{origin !== "Not set" || destination !== "Not set" ? `${origin} → ${destination}` : "New trip"}</h2></div><span className="status-chip">{discovery?.phase === "completed" ? "Discovered" : "Planning"}</span></div>
    <div className="workspace-section"><h3>Trip intent</h3><dl className="trip-fields"><div><dt>Origin</dt><dd>{origin}</dd></div><div><dt>Destination</dt><dd>{destination}</dd></div><div><dt>Departure window</dt><dd>Conversation context</dd></div><div><dt>Destination stay</dt><dd>Conversation context</dd></div></dl></div>
    <div className="workspace-section"><div className="section-title-row"><h3>Discovery</h3><span className="muted-badge">{discovery?.phase === "completed" ? `${hubs.length} hubs` : discovery ? "Running" : "Not run"}</span></div>{hubs.length > 0 ? <div className="hub-list">{hubs.slice(0, 12).map((hub: any, index: number) => <div className="hub-card" key={hub.id ?? index}><div><strong>{hub.city ?? hub.id ?? "Hub"}</strong><span>{hub.countryCode ?? ""}</span></div><small>{Array.isArray(hub.feasibleHubNights) ? `${hub.feasibleHubNights.join(", ")} night options` : "Feasible stopover"}</small></div>)}</div> : <div className="empty-workspace"><strong>{discovery?.message ?? "No hub results yet"}</strong><p>Live Cuberence discovery results will appear here while the conversation continues.</p></div>}</div>
    <div className="workspace-section"><div className="section-title-row"><h3>Pricing</h3><span className="muted-badge">Not connected</span></div><p className="workspace-note">Pricing becomes available after discovery and advisor hub selection.</p></div>
  </aside>;
}
