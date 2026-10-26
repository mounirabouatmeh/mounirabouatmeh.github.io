const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
function node(tag, className, text) {
  return { tag, className, text, children: [], listeners: {}, append(...children) { this.children.push(...children); },
    addEventListener(type, handler) { this.listeners[type] = handler; }, get childElementCount() { return this.children.length; } };
}
const ctx = vm.createContext({ URL, Event, dispatchEvent() {}, createNode: node });
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
vm.runInContext(candidates.replace('  syncFns.push(syncCandidates);', '  globalThis.testViews = { kiwiOfferLinks, confirmedTickets, confirmedBlock, scheduleBlock, scheduleChangeBlock };\n  syncFns.push(syncCandidates);'), ctx);
test('Kiwi-linked candidates show only their two validated returned fare links', () => {
 const block = ctx.testViews.kiwiOfferLinks({ kiwiLinkedPricing: {price:{amount:825,currency:'CAD'}}, offers: [kiwi('outer', 'https://www.kiwi.com/outer'), { provider: 'SABRE' }] });
 assert.equal(block.children.length, 1);
 assert.match(block.children[0].text, /indicative/);
 assert.equal(ctx.testViews.kiwiOfferLinks({ offers: [{ provider: 'SABRE' }] }), null);
 assert.equal(ctx.testViews.kiwiOfferLinks({ offers: [kiwi('unmatched', 'https://www.kiwi.com/mismatched')], pricingStatus: 'PROXY' }), null,
   'never label a provider return date/carrier proxy as a link to the ADB itinerary');

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

test('top-level exact pricing supplies links only for its selected candidate', () => {
 ctx.CuberenceIssue23.s.confirmation = { candidateId: 'selected', confirmedPricing: {
  outerOffer: kiwi('outer', 'https://www.kiwi.com/top-level-exact') } };
 const links = ctx.testViews.kiwiOfferLinks({ id: 'selected', offers: [kiwi('proxy', 'https://www.kiwi.com/proxy')] }, false);
 assert.equal(links.children[0].href, 'https://www.kiwi.com/top-level-exact');
 assert.equal(ctx.testViews.kiwiOfferLinks({ id: 'other' }, false), null);
 ctx.CuberenceIssue23.s.confirmation = null;
});

test('Kiwi-linked schedule block labels the displayed provider flights, not ADB', () => {
 const flight = (flightNumber,origin,destination) => ({
   marketingCarrier: 'BF', flightNumber, origin, destination,
   departure: '2026-11-08T23:00:00Z', arrival: '2026-11-09T06:00:00Z',
   originTimeZone:'America/Toronto',destinationTimeZone:'Europe/Paris',
 });
 const candidate = { kiwiLinkedPricing: {price:{amount:1629,currency:'CAD'}}, exactSchedule: {
   source: 'KIWI', outerOutbound:flight('BF761','YUL','ORY'),
   innerOutbound:flight('ME230','CDG','BEY'), innerReturn:flight('ME211','BEY','CDG'),
   outerReturn:flight('BF760','ORY','YUL'),
 }};
 const block = ctx.testViews.scheduleBlock(candidate,'PROXY');
 assert.match(block.children[0].children[0].text,/Kiwi-priced flight schedule/);
 assert.match(block.children[0].children[1].text,/Actual flights/);
});

test('verified codeshare alternative shows its own actual Kiwi fares, flights and links', () => {
 const outer = { ...kiwi('actual-outer', 'https://www.kiwi.com/codeshare-outer'), price: {amount: 890,currency:'CAD'},
   legs:[{origin:'YUL',destination:'CDG',segments:[{
      origin:'YUL',destination:'CDG',departure:'2026-11-09T03:00:00Z',arrival:'2026-11-09T09:00:00Z',
      marketingCarrier:'AC',flightNumber:'AC874'}]}]};
 const inner = { ...kiwi('actual-inner','https://www.kiwi.com/codeshare-inner'), price: {amount: 910,currency:'CAD'},
   legs:[{origin:'CDG',destination:'BEY',segments:[{
      origin:'CDG',destination:'BEY',departure:'2026-11-12T11:40:00Z',arrival:'2026-11-12T16:15:00Z',
      marketingCarrier:'ME',flightNumber:'ME230'}]}]};
 const item = {scheduleChange:{
   provider:'KIWI',kind:'CODESHARE_MARKETING_ALTERNATIVE',
   alternativePrice:{amount:1800,currency:'CAD'},outerOffer:outer,innerOffer:inner,
   differences:[],marketingChanges:[{
     role:'HUB_TO_DESTINATION',selectedFlightNumber:'AF5106',selectedMarketingCarrier:'AF',
     kiwiFlightNumber:'ME230',kiwiMarketingCarrier:'ME',verifiedOperatingCarrier:'ME'}],
   alternativeAssessment:{candidateStatus:'VALID',hubNights:2,usableCityHours:40,returnSelfConnectMinutes:240,risks:[]},
 }};
 const rendered = ctx.testViews.scheduleChangeBlock(item);
 const texts=rendered.children.map(child=>String(child.text??'')).join(' ');
 assert.match(texts,/verified codeshare alternative/i);
 assert.match(texts,/AF5106/);
 assert.match(texts,/ME230/);
 assert.match(texts,/890/);
 assert.match(texts,/910/);
 const links=rendered.children.filter(c=>c.tag==='a');
 assert.deepEqual(links.map(x=>x.href),['https://www.kiwi.com/codeshare-outer','https://www.kiwi.com/codeshare-inner']);
 assert.doesNotMatch(texts,/the itinerary you selected\./);
 assert.match(texts,/advisor has not authorized/i);
});
