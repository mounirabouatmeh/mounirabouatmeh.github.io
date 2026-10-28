const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");

const issue115 = fs.readFileSync("static-issue115.js", "utf8");
const candidates = fs.readFileSync("static-issue23-candidates.js", "utf8");

function pricedRow(id, tag, cheapRank, expRank, amount) {
  return {
    candidateId: id,
    candidateNumber: Number(id.split("-")[1]),
    tag,
    ...(cheapRank === undefined ? {} : { cheapestRank: cheapRank }),
    ...(expRank === undefined ? {} : { experienceRank: expRank }),
    priceEvidence: "FLIGHT_MATCHED_PROVIDER_SHOP",
    price: { amount, currency: "CAD" },
    exactSchedule: {source:"AERODATABOX",outerOutbound:{flightNumber:"343"}},
    facts:{returnSelfConnectMinutes:115},
    outerTicket: { offerId: "o-" + id, price:{amount:1000,currency:"CAD"} },
    innerTicket: { offerId: "i-" + id, price:{amount:amount-1000,currency:"CAD"} },
  };
}
function makeTable(state = "READY") {
  return {
    schemaVersion:1, owner:"CUBERENCE_ENGINE", mode:"EXPLANATION_ONLY",
    definition:"CHEAPEST_DISCOVERED_AND_VALIDATED", state, currency:"CAD",
    rows:[
      pricedRow("c-7","FEASIBLE_CHEAPEST",1,undefined,1763),
      pricedRow("c-8","FEASIBLE_CHEAPEST",2,undefined,1767),
      pricedRow("c-3","FEASIBLE_CHEAPEST",3,undefined,1787),
      pricedRow("c-93","BEST_EXPERIENCE",undefined,2,5514),
      pricedRow("c-105","BEST_EXPERIENCE",undefined,3,5645),
    ],
    limitations:["UNPRICED_TOP_EXPERIENCE_SCHEDULES"],
  };
}
function fixture(pricing) {
  const s={pricing};
  const C={s,node:()=>({}),syncFns:[],candidateNumber:()=>null};
  const context=vm.createContext({
    CuberenceIssue23:C,
    document:{
      readyState:"loading",
      addEventListener(){},
      querySelector(){return null;},
    },
    requestAnimationFrame(){},
  });
  vm.runInContext(issue115,context,{timeout:2000});
  return {s,C,api:context.CuberenceIssue115};
}
function universe() {
  return {
    currency:"CAD",
    columns:["candidateId","candidateNumber","candidateStatus","recommendation","hubId","hubName","hubNights","destinationNights","usableCityHours","pricingStatus","totalPrice"],
    rows:["1","2","3","4","5","6","7","8","9","93","105"].map(id=>
      ["c-"+id,Number(id),"VALID",Number(id)<=9?"RECOMMENDED":null,"paris_fr","Paris",2,18,49.5,"UNPRICED",null]),
  };
}
test("G5 READY wins over 9 legacy picks: only priced engine #7, #8, #3, #93 and #105",()=>{
  const pricing={
    candidates:[{id:"c-7"},{id:"c-8"},{id:"c-3"}],evaluations:[],
    page:{fullAnalysis:{candidateUniverse:universe(),
      universeRecommendationCategories:{bestPrice:["c-1","c-2","c-3"],bestExperience:["c-4","c-5","c-6"],bestValue:["c-7","c-8","c-9"]}}},
    recommendationTableV1:makeTable(),
  };
  const {api}=fixture(pricing);
  assert.deepEqual(Array.from(api.recommendedIds()).sort(),["c-105","c-3","c-7","c-8","c-93"].sort());
  assert.equal(api.engineRowFor("c-93")?.price?.amount,5514);
  assert.equal(api.engineRowFor("c-1"),null,"unpriced legacy picks cannot be promoted");
  api.setView("recommended");
  assert.equal(pricing.candidates.length,5,"off-page #93 and #105 hydrated for workspace tiles");
  const offPage=pricing.candidates.find(x=>x.id==="c-93");
  assert.equal(offPage.totalPrice.amount,5514,"real engine fare, never market proxy");
  assert.equal(offPage.exactSchedule.source,"AERODATABOX");
  assert.equal(offPage.fareEvidenceAuthority,"FLIGHT_MATCHED_PROVIDER_SHOP");
});
test("G5 WITHHELD, STALE or invalid never falls back to legacy recommended",()=>{
  for(const state of ["WITHHELD","STALE"]){
    const {api}=fixture({recommendationTableV1:makeTable(state),
      page:{fullAnalysis:{candidateUniverse:universe(),universeRecommendationCategories:{legacy:["c-1"]}}}});
    assert.equal(api.recommendedIds().size,0,state);
    assert.equal(api.engineRowFor("c-7"),null);
  }
  const wrong=makeTable();wrong.rows[0].outerTicket.price.amount=1;
  const {api}=fixture({recommendationTableV1:wrong,
    page:{fullAnalysis:{candidateUniverse:universe(),universeRecommendationCategories:{legacy:["c-1"]}}}});
  assert.equal(api.recommendedIds().size,0,"unreconciled RT total invalidates surfaced engine table");
});
test("old jobs without any G5 table still allow legacy result filtering",()=>{
  const {api}=fixture({page:{fullAnalysis:{
    candidateUniverse:universe(),universeRecommendationCategories:{legacy:["c-1","c-2"]},
  }}});
  assert.deepEqual(Array.from(api.recommendedIds()),["c-1","c-2","c-3","c-4","c-5","c-6","c-7","c-8","c-9"]);
});
test("G5 card price labels do not silently reuse route/date proxy or claim issued fare",()=>{
  assert.match(candidates,/CuberenceIssue115\?\.engineRowFor/);
  assert.match(candidates,/Provider-matched fare/);
  assert.match(candidates,/Engine-validated fare/);
  assert.match(candidates,/engineFare \? money\(engineFare.price\)/);
  assert.match(candidates,/Outer RT/);
  assert.match(candidates,/Kiwi ticket marketing differs from ADB/);
  assert.match(candidates,/status === "PROXY" \|\| status === "UNPRICED"/);
  assert.match(candidates,/No synthetic booking links/);
});
