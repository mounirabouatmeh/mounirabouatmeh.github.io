const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
function node(tag, className, text) {
  return { tag, className, text, children: [], listeners: {}, append(...children) { this.children.push(...children); },
    addEventListener(type, handler) { this.listeners[type] = handler; }, get childElementCount() { return this.children.length; } };
}
const ctx = vm.createContext({ URL, createNode: node });
const app = fs.readFileSync('static-app.js', 'utf8');
vm.runInContext(app.slice(app.indexOf('function kiwiTicketLink('), app.indexOf('\nconst state')), ctx);
const kiwi = (id, url) => ({ id, provider: 'KIWI', kiwi: { bookingUrl: url }, price: { amount: 100, currency: 'CAD' }, legs: [{ origin: 'YUL', destination: 'CDG', segments: [] }] });

test('Kiwi offers keep their returned booking URL and open in a separate tab', () => {
 const url = 'https://www.kiwi.com/en/booking?token=opaque&currency=CAD';
 const link = ctx.CuberenceKiwiTicketLink(kiwi('offer', url));
 assert.equal(link.href, url);
 assert.equal(link.target, '_blank');
 assert.equal(link.rel, 'noopener noreferrer');
 let stopped = 0;
 link.listeners.click({ stopPropagation() { stopped++; } });
 link.listeners.keydown({ stopPropagation() { stopped++; } });
 assert.equal(stopped, 2);
});
test('Sabre and missing-URL offers do not receive Kiwi links', () => {
 assert.equal(ctx.CuberenceKiwiTicketLink({ ...kiwi('sabre', 'https://www.kiwi.com'), provider: 'SABRE' }), null);
 assert.equal(ctx.CuberenceKiwiTicketLink({ provider: 'KIWI' }), null);
});
test('non-Kiwi or unsafe URLs do not create links', () => {
 for (const url of ['javascript:alert(1)', 'http://www.kiwi.com/', 'https://kiwi.com.example.org/', 'https://user:pass@www.kiwi.com/'])
  assert.equal(ctx.CuberenceKiwiTicketLink(kiwi('unsafe', url)), null);
});
ctx.document = { readyState: 'loading', addEventListener() {} };
ctx.CuberenceIssue23 = { s: {}, node, money: p => p?.amount, formatDateTime: t => t, syncFns: [] };
const candidates = fs.readFileSync('static-issue23-candidates.js', 'utf8');
vm.runInContext(candidates.replace('  syncFns.push(syncCandidates);', '  globalThis.testViews = { kiwiOfferLinks, confirmedTickets };\n  syncFns.push(syncCandidates);'), ctx);
test('indicative candidates show links only for their returned Kiwi tickets', () => {
 const block = ctx.testViews.kiwiOfferLinks({ offers: [kiwi('outer', 'https://www.kiwi.com/outer'), { provider: 'SABRE' }] });
 assert.equal(block.children.length, 1);
 assert.match(block.children[0].text, /indicative/);
 assert.equal(ctx.testViews.kiwiOfferLinks({ offers: [{ provider: 'SABRE' }] }), null);
});
test('confirmed ticket links come from exact offers rather than earlier proxies', () => {
 const block = ctx.testViews.confirmedTickets({ offers: [kiwi('proxy', 'https://www.kiwi.com/proxy')], confirmedPricing: {
  outerOffer: kiwi('outer', 'https://www.kiwi.com/exact-outer'), innerOffer: kiwi('inner', 'https://www.kiwi.com/exact-inner') } });
 const links = block.children.flatMap(ticket => ticket.children).filter(child => child.tag === 'a');
 assert.deepEqual(links.map(link => link.href), ['https://www.kiwi.com/exact-outer', 'https://www.kiwi.com/exact-inner']);
});

test('confirmed card summary links use exact offers and never proxy URLs', () => {
 const candidate = { offers: [kiwi('proxy', 'https://www.kiwi.com/proxy')], confirmedPricing: {
   outerOffer: kiwi('exact-outer', 'https://www.kiwi.com/exact-outer'), innerOffer: kiwi('exact-inner', 'https://www.kiwi.com/exact-inner') } };
 const links = ctx.testViews.kiwiOfferLinks(candidate, false);
 assert.deepEqual(Array.from(links.children, link => link.href), ['https://www.kiwi.com/exact-outer', 'https://www.kiwi.com/exact-inner']);
 assert.equal(ctx.testViews.kiwiOfferLinks({ offers: candidate.offers }, false), null);
});
