import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyRehearsal} from './verify-rehearsal.mjs';
test('exit code 2 alone cannot certify a skipped synthetic rehearsal',()=>{
 const gates=Object.fromEntries(['preflight','source_snapshot','isolated_target','import','reconciliation','acceptance','restart_persistence','backup_restore','rollback'].map(g=>[g,{status:'PASS'}]));
 const r={gates:{...gates,real_source:{status:'N/A'}},restore:{status:'PASS'},rollback:{routingRestoration:'PASS'},source:{kind:'synthetic'},ownerDecisions:{id:'owner-2026-09-26-no-production-data'},legacyVersionRollback:{status:'N/A'},readiness:'READY_FOR_OWNER_ACCEPTANCE',ownerAcceptance:'NOT_RUN',sourceArchivalAuthorized:false,target:{dirty:false},discrepancies:[]};
 assert.equal(verifyRehearsal(r),true);
 r.gates.preflight.status='REQUIRES_REVIEW';assert.throws(()=>verifyRehearsal(r));
 r.gates.preflight.status='PASS';r.restore.status='NOT_RUN';assert.throws(()=>verifyRehearsal(r));
});
