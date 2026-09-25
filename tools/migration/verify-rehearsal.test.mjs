import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyRehearsal} from './verify-rehearsal.mjs';
test('exit code 2 alone cannot certify a skipped synthetic rehearsal',()=>{
 const gates=Object.fromEntries(['preflight','source_snapshot','isolated_target','import','reconciliation','acceptance','restart_persistence','backup_restore'].map(g=>[g,{status:'PASS'}]));
 const r={gates:{...gates,real_source:{status:'NOT_RUN'}},restore:{status:'PASS'},rollback:{routingRestoration:'PASS'},source:{kind:'synthetic'},readiness:'NOT_READY',ownerAcceptance:'NOT_RUN',sourceArchivalAuthorized:false,target:{dirty:false},discrepancies:[]};
 assert.equal(verifyRehearsal(r),true);
 r.gates.preflight.status='REQUIRES_REVIEW';assert.throws(()=>verifyRehearsal(r));
 r.gates.preflight.status='PASS';r.restore.status='NOT_RUN';assert.throws(()=>verifyRehearsal(r));
});
