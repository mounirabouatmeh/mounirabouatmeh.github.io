const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

const issue100 = fs.readFileSync("static-issue100.js", "utf8");
const issue115 = fs.readFileSync("static-issue115.js", "utf8");
const injected = issue100.replace(
  "  syncFns.unshift(syncIssue100);",
  "  globalThis.__issue100Test = { applyStep8PriceOrder, loadNextPage, priceOrder, matchedFare };\n  syncFns.unshift(syncIssue100);",
);
assert.notEqual(injected, issue100);

const columns = [
  "candidateId", "candidateNumber", "hubId", "hubName",
  "hubNights", "destinationNights", "usableCityHours",
  "candidateStatus", "pricingStatus", "totalPrice", "risks", "overallScore",
];
const row = (n) => [
  "c-" + n, n, "paris_fr", "Paris", n % 3 + 1, 18, 30 + n % 60,
  "VALID", "PROXY", 700 + n, "", null,
];
function build(count=120, pricedCount=70) {
  const records = Array.from({length:count}, (_,i)=>row(i+1));
  const step8Rows = records.map((r,i) => {
    const priced = i % 3 !== 0 && (i % 3 === 1 || i % 3 === 2) && i < pricedCount * 2;
    const total = 1700 + (count - i) * 3;
    return {
      candidateId:r[0], candidateNumber:r[1],
      pricingStatus:priced ? "PRICED" : "UNPRICED",
      priceEvidence:priced ? "FLIGHT_MATCHED_PROVIDER_SHOP" : "INCOMPLETE_OR_UNPRICED",
      totalPrice:priced ? total : null,
      outerPrice:priced ? 700 : null,
      innerPrice:priced ? total - 700 : null,
      baselineDelta:priced ? total - 1400 : null,
      reviewRequired:false,
      flights:{},
    };
  });
  const indexed = step8Rows.filter(x=>x.pricingStatus==="PRICED");
  const table = {
    schemaVersion:2,stage:"STEP8_POST_ENRICHMENT_ANALYSIS",
    candidateCount:count,currency:"CAD",
    fullyPricedCandidates:indexed.length,rows:step8Rows,
  };
  const universe = {columns,rows:records,total:count,currency:"CAD"};
  return {universe,table};
}
function ctx(fixture=build()) {
  const pricing = {
    phase:"completed",pricingId:"abc-job",
    candidates:fixture.universe.rows.slice(0,50).map(r=>({
      id:r[0],hub:{name:"Paris"},hubNights:r[4],totalPrice:{amount:r[9],currency:"CAD"},
      pricingStatus:"PROXY",candidateStatus:"VALID",
    })),
    evaluations:[],page:{fullAnalysis:{candidateUniverse:fixture.universe}},
  };
  const s = { pricing,pricingId:"abc-job",selectedCandidateId:null,confirmation:null,
    phases:{confirmation:"waiting"},streamBusy:false };
  let renderCount=0;
  const C = {s,node(){return{}},syncFns:[],queue(){},candidateStatus:c=>c?.pricingStatus};
  const context = vm.createContext({
    CuberenceIssue23:C,
    document:{readyState:"loading",addEventListener(){}},
    requestAnimationFrame(){},
    renderWorkspace(){renderCount++;},
    fetch(){throw Error("unexpected network call")},
  });
  vm.runInContext(injected,context,{timeout:2000});
  return {C,s,api:context.__issue100Test,renderCount:()=>renderCount};
}
function rowId(row) {return row[0];}

test("sort globally, not only the initial 50; verified totals first; market refs last",()=>{
  const data=build();
  const {api,s,C}=ctx(data);
  const expectedPriced=data.table.rows.filter(r=>r.pricingStatus==="PRICED")
    .sort((a,b)=>a.totalPrice-b.totalPrice || a.candidateNumber-b.candidateNumber)
    .map(r=>r.candidateId);
  const originalNumbers=new Map(data.universe.rows.map(r=>[r[0],r[1]]));
  assert.equal(api.applyStep8PriceOrder(data.table,"abc-job"),true);
  assert.equal(s.pricing.candidates.length,50);
  assert.deepEqual(s.pricing.candidates.map(x=>x.id),expectedPriced.slice(0,50));
  assert.equal(s.pricing.candidates[0].id,expectedPriced[0]);
  assert.equal(C.pricedRowFor(expectedPriced[0]).price.amount,
    data.table.rows.find(r=>r.candidateId===expectedPriced[0]).totalPrice);
  assert.equal(C.pricedRowFor("c-1"),null,
    "market-reference amounts must never count as matched fare");
  api.loadNextPage();
  assert.equal(s.pricing.candidates.length,100);
  api.loadNextPage();
  assert.equal(s.pricing.candidates.length,120);
  const sortedIds=s.pricing.candidates.map(c=>c.id);
  assert.deepEqual(sortedIds.slice(0,expectedPriced.length),expectedPriced);
  const unpriced=sortedIds.slice(expectedPriced.length);
  assert.ok(unpriced.length>0);
  assert.ok(unpriced.every(id=>!C.pricedRowFor(id)));
  assert.deepEqual(new Set(sortedIds),new Set(data.table.rows.map(r=>r.candidateId)));
  assert.ok(data.universe.rows.every(row=>row[1]===originalNumbers.get(rowId(row))),
    "canonical candidate numbers never change when sorting");
});

test("comparable price ties preserve canonical numbering",()=>{
  const data=build(6,3);
  const [a,b]=data.table.rows.filter(r=>r.pricingStatus==="PRICED");
  b.totalPrice=a.totalPrice;
  b.innerPrice=a.innerPrice;
  b.baselineDelta=a.baselineDelta;
  const {api,s}=ctx(data);
  assert.equal(api.applyStep8PriceOrder(data.table,"abc-job"),true);
  const firstTwo=s.pricing.candidates.filter(x=>x.id===a.candidateId||x.id===b.candidateId);
  assert.equal(firstTwo[0].id,a.candidateId);
  assert.equal(firstTwo[1].id,b.candidateId);
});

test("equal-price ties honor immutable Step8 final cheapest ranks without renumbering", () => {
  const data = build(9, 3);
  const priced = data.table.rows.filter(r => r.pricingStatus === "PRICED");
  const [a,b] = priced;
  b.totalPrice = a.totalPrice;
  b.innerPrice = a.innerPrice;
  b.baselineDelta = a.baselineDelta;
  // Intentionally reverse display numbers versus engine-owned cheapest rank.
  a.finalCheapestRank = 2;
  b.finalCheapestRank = 1;
  const { api, s } = ctx(data);
  assert.equal(api.applyStep8PriceOrder(data.table,"abc-job"),true);
  const order = s.pricing.candidates.map(x=>x.id);
  assert.ok(order.indexOf(b.candidateId) < order.indexOf(a.candidateId));
  assert.equal(data.table.rows.find(r=>r.candidateId===b.candidateId).finalCheapestRank,1);
});

test("reject contradictory fare data and stay unsorted instead of treating proxy as a fare",()=>{
  const data=build();
  const {api,s}=ctx(data);
  const before=s.pricing.candidates.map(c=>c.id);
  const bad={...data.table,fullyPricedCandidates:999};
  assert.equal(api.applyStep8PriceOrder(bad,"abc-job"),false);
  assert.deepEqual(s.pricing.candidates.map(c=>c.id),before);
});

test("Step9 only selects recommendations; Step8 prices do not create Luna picks",()=>{
  assert.match(issue115,/C\.pricedRowFor\?\.\(id\)/);
  assert.match(issue115,/const recommendations = recommendedIds\(\)/);
  assert.doesNotMatch(issue115,/recommendationTableV1/);
  assert.match(issue100,/step8-export/);
  assert.match(issue100,/sortLoadedCandidates/);
});
