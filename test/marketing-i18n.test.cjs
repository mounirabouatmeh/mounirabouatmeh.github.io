/* Marketing locale parity: structural regressions must not silently drop a section. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
function read(rel) { return readFileSync(path.join(root, rel), "utf8"); }
function matches(html, regex) { return Array.from(html.matchAll(regex), (m) => m[1] || m[0]); }

for (const [english, french] of [["index.html", "fr/index.html"], ["about/index.html", "fr/about/index.html"]]) {
  test(english + " matches the French page's design and functions", () => {
    const en = read(english), fr = read(french);
    assert.match(en, /<html lang="en">/);
    assert.match(fr, /<html lang="fr-CA">/);
    assert.deepEqual(matches(en, /<\/?[a-z][a-z0-9-]*(?=[\s>])/gi), matches(fr, /<\/?[a-z][a-z0-9-]*(?=[\s>])/gi), "HTML element structure must remain equal");
    assert.deepEqual(matches(en, /class="([^"]*)"/g), matches(fr, /class="([^"]*)"/g), "CSS classes must remain equal");
    assert.deepEqual(matches(en, /<img [^>]*src="([^"]*)"/g), matches(fr, /<img [^>]*src="([^"]*)"/g), "All illustrations must match");
    assert.equal(matches(en, /href="https:\/\/app\.simplymeet\.me\/cuberence"/g).length, matches(fr, /href="https:\/\/app\.simplymeet\.me\/cuberence"/g).length, "Booking CTAs must match");
    assert.equal(matches(en, /href="https:\/\/app\.cuberence\.com\/"/g).length, matches(fr, /href="https:\/\/app\.cuberence\.com\/"/g).length, "Login CTAs must match");
    for (const page of [en, fr]) {
      assert.match(page, /language-switch\.css/);
      assert.match(page, /language-switch\.js/);
      assert.match(page, /class="language-switch"/);
      assert.match(page, /class="mobile-language-choice"/);
      assert.match(page, /rel="alternate" hreflang="fr-CA"/);
      assert.match(page, /rel="alternate" hreflang="en"/);
    }
    assert.match(en, /data-language="en" aria-current="page"/);
    assert.match(fr, /data-language="fr" aria-current="page"/);
    assert.doesNotMatch(fr, />Book a demo</);
    assert.doesNotMatch(fr, />Log in</);
  });
}
test("French language routes remain inside French marketing site", () => {
  const fr = read("fr/index.html"), about = read("fr/about/index.html");
  assert.match(fr, /href="\/fr\/about\/"/);
  assert.match(about, /href="\/fr\/#how"/);
  assert.match(about, /href="\/fr\/" aria-label="Accueil de Cuberence"/);
  assert.match(read("language-switch.js"), /cuberence-marketing-language/);
});

test("French marketing copy uses clear travel-agent vocabulary", () => {
  const home = read("fr/index.html");
  const about = read("fr/about/index.html");
  assert.match(home, /Chaque voyage peut en cacher un autre/);
  assert.match(home, /correspondance en un séjour de 1 à 3 nuits/);
  assert.match(home, /vendre|ventes d’hôtels/);
  assert.match(home, /billetterie/);
  assert.match(home, /<strong>1 000\+<\/strong>/);
  assert.match(home, /Planifier une démo/);
  assert.match(about, /conseillers et les agences de voyages/);
  for (const expression of [
    "mini-destination passionnante",
    "vols prometteurs",
    "Cuberence en pratique en action",
    "Le même billet. Partout.",
    "la flexibilité de votre client",
    "des agences en ligne, de l’IA"
  ]) {
    assert.ok(!home.toLowerCase().includes(expression.toLowerCase()), "Avoid literal or clumsy wording: " + expression);
  }
});
