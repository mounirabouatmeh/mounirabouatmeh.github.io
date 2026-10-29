const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");

const issue115 = fs.readFileSync("static-issue115.js", "utf8");
const candidates = fs.readFileSync("static-issue23-candidates.js", "utf8");

function row(id, categories, ranks, totalPrice) {
  return {
    candidateId: id, candidateNumber: Number(id.split("-")[1]),
    categories, cheapestRank: ranks.cheapest ?? null,
    experienceRank: ranks.experience ?? null, valueRank: ranks.value ?? null,
    experienceReason: ranks.experience ? "This creates a rewarding city stopover with practical flights." : null,
    valueReason: ranks.value ? "This offers a persuasive balance of comfort and airfare." : null,
    outerPrice: 700, innerPrice: totalPrice - 700, totalPrice,
    baselineDelta: totalPrice - 1500, hubName: "Paris", hubNights: 2,
    usableCityHours: 52, feasibility: "VALID", reviewRequired: false,
    flights: {
      outerOutbound: {origin:"YUL",destination:"CDG",marketingCarrier:"AF",flightNumber:"AF343",departure:"2026-11-01T12:00Z",arrival:"2026-11-01T21:00Z"},
      innerOutbound: {origin:"CDG",destination:"BEY",marketingCarrier:"ME",flightNumber:"ME206",departure:"2026-11-03T09:00Z",arrival:"2026-11-03T14:00Z"},
      innerReturn: {origin:"BEY",destination:"CDG",marketingCarrier:"ME",flightNumber:"ME211",departure:"2026-11-25T05:00Z",arrival:"2026-11-25T09:00Z"},
      outerReturn: {origin:"CDG",destination:"YUL",marketingCarrier:"AF",flightNumber:"AF344",departure:"2026-11-25T17:00Z",arrival:"2026-11-26T02:00Z"},
    },
  };
}
function step9(state="READY") {
  return {
    schemaVersion:1,stage:"STEP9_LUNA_INDEPENDENT_ASSESSMENT",
    owner:"LUNA_ANALYSIS_CUBERENCE_VALIDATED",
    state, currency:"CAD",environment:"PRODUCTION",
    cheapestIds:["c-7","c-8","c-3"],
    experienceIds:["c-93","c-105","c-8"],
    overallValueIds:["c-3","c-93","c-105"],
    rows:state==="READY" ? [
      row("c-7",["CHEAPEST"],{cheapest:1},1764),
      row("c-8",["CHEAPEST","BEST_EXPERIENCE"],{cheapest:2,experience:3},1764),
      row("c-3",["CHEAPEST","OVERALL_VALUE"],{cheapest:3,value:1},1764),
      row("c-93",["BEST_EXPERIENCE","OVERALL_VALUE"],{experience:1,value:2},1820),
      row("c-105",["BEST_EXPERIENCE","OVERALL_VALUE"],{experience:2,value:3},1860),
    ]:[],
    limitations:state==="READY"?[]:["LUNA_ASSESSMENT_UNAVAILABLE"],
  };
}
function oldG5() {
  return {schemaVersion:1,owner:"CUBERENCE_ENGINE",mode:"EXPLANATION_ONLY",
    definition:"CHEAPEST_DISCOVERED_AND_VALIDATED",state:"READY",
    rows:[{candidateId:"c-1",tag:"BEST_EXPERIENCE",experienceRank:1}]};
}
function universe() {
  return {
    currency:"CAD",
    columns:["candidateId","candidateNumber","candidateStatus","recommendation",
      "hubId","hubName","hubNights","destinationNights","usableCityHours","pricingStatus","totalPrice"],
    rows:["1","2","3","4","5","6","7","8","9","93","105"].map(id=>
      ["c-"+id,Number(id),"VALID",Number(id)<=9?"RECOMMENDED":null,
        "paris_fr","Paris",2,18,49.5,"UNPRICED",null]),
  };
}
function fixture(pricing) {
  const s={pricing};
  const C={s,node:()=>({}),syncFns:[],candidateNumber:()=>null};
  const context=vm.createContext({
    CuberenceIssue23:C,
    document:{readyState:"loading",addEventListener(){},querySelector(){return null;}},
    requestAnimationFrame(){},
  });
  vm.runInContext(issue115,context,{timeout:2000});
  return {s,C,api:context.CuberenceIssue115};
}
function samplePricing(state="READY") {
  return {
    candidates:[{id:"c-7"},{id:"c-8"},{id:"c-3"}],evaluations:[],
    page:{fullAnalysis:{candidateUniverse:universe(),
      universeRecommendationCategories:{legacy:["c-1","c-2","c-3"]}}},
    step9Assessment:step9(state),recommendationTableV1:oldG5(),
  };
}

test("Step9 READY is the only shortlist authority: three cheapest, experiences and values, overlap once",()=>{
  const pricing=samplePricing();
  const {api}=fixture(pricing);
  assert.deepEqual(Array.from(api.recommendedIds()).sort(),
    ["c-105","c-3","c-7","c-8","c-93"].sort());
  assert.equal(api.engineRowFor("c-93")?.price.amount,1820);
  assert.equal(api.engineRowFor("c-93")?.experienceRank,1);
  assert.equal(api.engineRowFor("c-93")?.valueRank,2);
  assert.equal(api.engineRowFor("c-93")?.experienceReason.includes("rewarding"),true);
  assert.equal(api.engineRowFor("c-1"),null,"G5's expensive or unpriced selection never returns");
  api.setView("recommended");
  assert.equal(pricing.candidates.length,5,"off-page finalists hydrated without new pricing calls");
  const offPage=pricing.candidates.find(c=>c.id==="c-93");
  assert.equal(offPage.totalPrice.amount,1820);
  assert.equal(offPage.exactSchedule.source,"Cuberence");
  assert.equal(offPage.exactSchedule.outerOutbound.originTimeZone,"UTC");
  assert.equal(offPage.fareEvidenceAuthority,"FLIGHT_MATCHED_PROVIDER_SHOP");
});
test("Step9 WITHHELD does not fall back to ready G5 or legacy recommendation flags",()=>{
  const {api}=fixture(samplePricing("WITHHELD"));
  assert.equal(api.recommendedIds().size,0);
  assert.equal(api.engineRowFor("c-1"),null);
  assert.equal(api.engineRowFor("c-7"),null);
});
test("no Step9 means no recommendation, even when G5 is READY or legacy universe has nine picks",()=>{
  const p=samplePricing();delete p.step9Assessment;
  const {api}=fixture(p);
  assert.equal(api.recommendedIds().size,0);
  assert.equal(api.engineRowFor("c-1"),null);
});
test("Step9 rejects counterfeit totals and duplicate identities",()=>{
  const p=samplePricing();
  p.step9Assessment.rows[0].outerPrice=1;
  assert.equal(fixture(p).api.recommendedIds().size,0);
  const q=samplePricing();
  q.step9Assessment.rows[4].candidateId="c-93";
  assert.equal(fixture(q).api.recommendedIds().size,0);
});
test("Step9 card labels and supplier-matched prices display without exact-confirmation claims",()=>{
  assert.match(issue115,/step9Assessment/);
  assert.match(issue115,/Luna · Experience/);
  assert.match(issue115,/Luna · Overall value/);
  assert.match(issue115,/step9-candidate-reasons/);
  assert.doesNotMatch(issue115,/recommendationTableV1/);
  assert.match(candidates,/CuberenceIssue115\?\.engineRowFor/);
  assert.match(candidates,/engineFare \? money\(engineFare.price\)/);
});
