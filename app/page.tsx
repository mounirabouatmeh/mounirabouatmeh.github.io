import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/">CUBERENCE</Link>
        <Link className="header-link" href="/app">Advisor workspace</Link>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <p className="eyebrow">Travel decision intelligence</p>
          <h1>Find the stopover strategy hidden inside a complex trip.</h1>
          <p className="hero-copy">
            Cuberence helps travel professionals explore feasible stayover cities,
            compare trip structures, and turn travel data into clear client decisions.
          </p>
          <div className="hero-actions">
            <Link className="button primary" href="/app">Open advisor workspace</Link>
            <a className="button secondary" href="mailto:contact@cuberence.com">Contact us</a>
          </div>
        </div>
      </section>

      <section className="services">
        <p className="eyebrow dark">Built for travel professionals</p>
        <h2>From trip intent to a decision worth presenting.</h2>
        <div className="service-grid">
          <article className="service-card"><span>01</span><h3>Conversational discovery</h3><p>Describe the client's trip naturally. Cuberence gathers the constraints it needs before searching.</p></article>
          <article className="service-card"><span>02</span><h3>Stopover intelligence</h3><p>Surface schedule-feasible city opportunities instead of forcing an advisor to guess candidate hubs.</p></article>
          <article className="service-card"><span>03</span><h3>Decision support</h3><p>Compare price, usable city time, itinerary structure, and travel trade-offs in advisor-ready language.</p></article>
        </div>
      </section>

      <footer className="site-footer">© 2026 Cuberence. All rights reserved.</footer>
    </main>
  );
}
