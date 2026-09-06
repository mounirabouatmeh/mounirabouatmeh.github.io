import Link from "next/link";
import { AdvisorChat } from "@/components/advisor-chat";

export default function AdvisorWorkspacePage() {
  return (
    <main className="app-page">
      <nav className="app-nav"><Link className="brand" href="/">CUBERENCE</Link><div className="app-nav-right"><span>Advisor workspace</span><span className="beta-badge">Agent shell</span></div></nav>
      <AdvisorChat />
    </main>
  );
}
