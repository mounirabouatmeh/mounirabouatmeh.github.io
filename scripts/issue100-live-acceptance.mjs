import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const URL = 'https://www.cuberence.com/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => Boolean(globalThis.CuberenceIssue23), null, { timeout: 60000 });

  const production = await page.evaluate(() => ({
    title: document.title,
    issue100Loaded: performance.getEntriesByType('resource').some((entry) => entry.name.includes('static-issue100.js')),
    hasPricingContent: Boolean(document.getElementById('pricing-content')),
  }));
  assert.equal(production.issue100Loaded, true, 'Production did not load static-issue100.js');
  assert.equal(production.hasPricingContent, true, 'Production pricing workspace missing');
  console.log('PASS production runtime loaded:', production);

  const columns = [
    'candidateNumber','candidateId','hubId','hubName','hubNights','totalPrice','baselineDelta',
    'usableCityHours','candidateStatus','pricingStatus','returnSelfConnectMinutes','outboundAirportChange',
    'returnSameAirport','overallScore','recommendation','operationalComplexityScore','priceImpactScore',
    'experienceValueScore','recommendationLabels','risks'
  ];
  const rows = Array.from({ length: 102 }, (_, i) => [
    i + 1,
    `cand-${String(i + 1).padStart(3, '0')}`,
    'paris_fr',
    'Paris',
    (i % 3) + 1,
    1500 + i,
    100 + i,
    24 + (i % 12),
    'VALID',
    'PROXY',
    240,
    false,
    true,
    80 - (i % 10),
    'RECOMMENDED',
    8,
    7,
    9,
    '',
    ''
  ]);

  await page.evaluate(({ columns, rows }) => {
    const C = globalThis.CuberenceIssue23;
    const fullCandidate = (row) => ({
      id: row[1],
      hub: { id: row[2], name: row[3] },
      hubNights: row[4],
      totalPrice: { currency: 'CAD', amount: row[5] },
      baselineDelta: { currency: 'CAD', amount: row[6] },
      usableCityHours: row[7],
      destinationNights: 21,
      candidateStatus: row[8],
      pricingStatus: row[9],
      strategy: 'SPLIT',
      facts: {
        returnSelfConnectMinutes: row[10],
        outboundAirportChange: row[11],
        returnSameAirport: row[12],
      },
      risks: [],
    });

    C.s.pricingId = 'live-ui-test-102';
    C.s.pricing = {
      phase: 'completed',
      pricingId: 'live-ui-test-102',
      candidates: rows.slice(0, 50).map(fullCandidate),
      evaluations: [],
      page: {
        fullAnalysis: {
          candidateUniverse: { columns, currency: 'CAD', total: 102, rows },
        },
      },
    };
    C.s.phases.summary = 'complete';
    C.s.phases.confirmation = 'ready';
    C.s.streamBusy = false;
    C.s.confirmationAuthorizedPending = false;

    const target = document.getElementById('pricing-content');
    target.replaceChildren();
    const interactive = document.createElement('div');
    interactive.className = 'interactive-pricing';
    target.append(interactive);

    // Keep this acceptance test focused on the deployed Issue #100 runtime.
    // Avoid the main workspace renderer replacing the synthetic test fixture.
    globalThis.renderWorkspace = () => {};
    C.queue();
  }, { columns, rows });

  await page.waitForSelector('.issue100-load-more', { timeout: 10000 });
  let pagination = await page.evaluate(() => ({
    count: globalThis.CuberenceIssue23.s.pricing.candidates.length,
    button: document.querySelector('.issue100-load-more')?.textContent,
    note: document.querySelector('.issue100-pagination-note')?.textContent,
  }));
  assert.equal(pagination.count, 50);
  assert.match(pagination.button ?? '', /Load 50 more candidates/);
  assert.match(pagination.note ?? '', /50 of 102/);
  console.log('PASS initial pagination:', pagination);

  await page.click('.issue100-load-more');
  await page.waitForFunction(() => {
    const C = globalThis.CuberenceIssue23;
    return C.s.pricing.candidates.length === 100
      && document.querySelector('.issue100-load-more')?.textContent?.includes('Load 2 more candidates')
      && document.querySelector('.issue100-pagination-note')?.textContent?.includes('100 of 102');
  });
  pagination = await page.evaluate(() => ({
    count: globalThis.CuberenceIssue23.s.pricing.candidates.length,
    button: document.querySelector('.issue100-load-more')?.textContent,
    note: document.querySelector('.issue100-pagination-note')?.textContent,
  }));
  assert.equal(pagination.count, 100);
  assert.match(pagination.button ?? '', /Load 2 more candidates/);
  assert.match(pagination.note ?? '', /100 of 102/);
  console.log('PASS second page:', pagination);

  await page.click('.issue100-load-more');
  await page.waitForFunction(() => {
    const C = globalThis.CuberenceIssue23;
    return C.s.pricing.candidates.length === 102 && !document.querySelector('.issue100-load-more');
  });
  pagination = await page.evaluate(() => ({
    count: globalThis.CuberenceIssue23.s.pricing.candidates.length,
    buttonExists: Boolean(document.querySelector('.issue100-load-more')),
  }));
  assert.deepEqual(pagination, { count: 102, buttonExists: false });
  console.log('PASS all 102 candidates loaded:', pagination);

  const reselection = await page.evaluate(async () => {
    const C = globalThis.CuberenceIssue23;
    const candidate = (id, amount) => ({
      id,
      hub: { id: 'paris_fr', name: 'Paris' },
      hubNights: 2,
      totalPrice: { currency: 'CAD', amount },
      usableCityHours: 30,
      destinationNights: 21,
      candidateStatus: 'VALID',
      pricingStatus: 'PROXY',
      strategy: 'SPLIT',
      facts: { returnSelfConnectMinutes: 240, outboundAirportChange: false, returnSameAirport: true },
      risks: [],
    });
    const a = candidate('cand-A', 1600);
    const b = candidate('cand-B', 1650);
    const c = candidate('cand-C', 1700);

    C.s.pricingId = 'live-ui-test-reselection';
    C.s.pricing = {
      phase: 'completed',
      pricingId: 'live-ui-test-reselection',
      candidates: [a, b, c],
      evaluations: [],
      page: { fullAnalysis: { candidateUniverse: { columns: [], currency: 'CAD', total: 3, rows: [] } } },
    };
    C.s.confirmation = {
      candidateId: 'cand-A',
      status: 'CONFIRMED',
      candidate: { ...a, pricingStatus: 'CONFIRMED', confirmedPricing: { price: { currency: 'CAD', amount: 2000 } } },
    };
    C.s.confirmationCandidateId = 'cand-A';
    C.s.selectedCandidateId = 'cand-A';
    C.s.lastSentCandidateId = 'cand-A';
    C.s.confirmationAuthorizedPending = false;
    C.s.streamBusy = false;
    C.s.phases.summary = 'complete';
    C.s.phases.confirmation = 'complete';
    C.s.phases.final = 'complete';

    const pricing = document.getElementById('pricing-content');
    pricing.innerHTML = `
      <div class="interactive-pricing">
        <article class="interactive-candidate" data-candidate-id="cand-A"><input class="issue23-itinerary-checkbox" type="checkbox"></article>
        <article class="interactive-candidate" data-candidate-id="cand-B"><input class="issue23-itinerary-checkbox" type="checkbox"></article>
        <article class="interactive-candidate" data-candidate-id="cand-C"><input class="issue23-itinerary-checkbox" type="checkbox"></article>
      </div>`;

    C.queue();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const before = {
      statusA: C.candidateStatus(a),
      canSelectB: C.canAuthorizeConfirmation(b),
      canSelectC: C.canAuthorizeConfirmation(c),
    };

    const form = document.getElementById('composer');
    const input = document.getElementById('message-input');
    globalThis.__issue100SubmittedMessage = null;
    form.requestSubmit = () => { globalThis.__issue100SubmittedMessage = input.value; };

    const bCheckbox = pricing.querySelector('[data-candidate-id="cand-B"] .issue23-itinerary-checkbox');
    bCheckbox.checked = true;
    bCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const afterSelection = {
      selectedCandidateId: C.s.selectedCandidateId,
      submittedMessage: globalThis.__issue100SubmittedMessage,
      statusA: C.candidateStatus(a),
    };

    // Simulate the normal completed tool output for Candidate B and verify A remains remembered.
    C.s.confirmation = {
      candidateId: 'cand-B',
      status: 'CONFIRMED',
      candidate: { ...b, pricingStatus: 'CONFIRMED', confirmedPricing: { price: { currency: 'CAD', amount: 2100 } } },
    };
    C.s.confirmationCandidateId = 'cand-B';
    C.s.confirmationAuthorizedPending = false;
    C.s.streamBusy = false;
    C.s.phases.confirmation = 'complete';
    C.s.phases.summary = 'complete';
    C.queue();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const afterSecondConfirmation = {
      statusA: C.candidateStatus(a),
      statusB: C.candidateStatus(b),
      canSelectC: C.canAuthorizeConfirmation(c),
    };

    return { before, afterSelection, afterSecondConfirmation };
  });

  assert.equal(reselection.before.statusA, 'CONFIRMED');
  assert.equal(reselection.before.canSelectB, true);
  assert.equal(reselection.before.canSelectC, true);
  assert.equal(reselection.afterSelection.selectedCandidateId, 'cand-B');
  assert.match(reselection.afterSelection.submittedMessage ?? '', /Candidate ID: cand-B/);
  assert.match(reselection.afterSelection.submittedMessage ?? '', /Advisor confirmation authorization: YES/);
  assert.equal(reselection.afterSelection.statusA, 'CONFIRMED');
  assert.equal(reselection.afterSecondConfirmation.statusA, 'CONFIRMED');
  assert.equal(reselection.afterSecondConfirmation.statusB, 'CONFIRMED');
  assert.equal(reselection.afterSecondConfirmation.canSelectC, true);
  console.log('PASS post-confirmation reselection:', JSON.stringify(reselection, null, 2));

  await page.screenshot({ path: 'issue100-live-acceptance.png', fullPage: true });
  console.log('ALL ISSUE #100 LIVE ACCEPTANCE CHECKS PASSED');
} finally {
  await browser.close();
}
