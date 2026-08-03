import { describe, it, expect } from "vitest";
import { calculateInheritance } from "@/lib/inheritance";
const c=(o:any)=>calculateInheritance({estate:1000000,spouse:"none",wives:1,sons:0,daughters:0,father:false,mother:false,fullBrothers:0,fullSisters:0,...o});
describe("mirath",()=>{
 it("wife+2sons+2daughters",()=>{const r=c({spouse:"wife",wives:2,sons:2,daughters:2});
  expect(r.distributed).toBe(1000000); console.log(r.shares.map(s=>`${s.ar} ${s.fraction} ${s.amount}`));});
 it("awl husband+2sisters+mother",()=>{const r=c({spouse:"husband",fullSisters:2,mother:true});
  console.log(r.method,r.shares.map(s=>`${s.ar} ${s.amount}`)); expect(r.distributed).toBe(1000000);});
 it("radd mother+daughter",()=>{const r=c({mother:true,daughters:1});console.log(r.method,r.shares.map(s=>`${s.ar} ${s.amount}`));expect(r.distributed).toBe(1000000);});
 it("umariyya",()=>{const r=c({spouse:"husband",father:true,mother:true});console.log(r.shares.map(s=>`${s.ar} ${s.amount}`));expect(r.distributed).toBe(1000000);});
});
