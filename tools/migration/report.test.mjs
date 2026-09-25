import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {newReport,setGate,finalize,mandatoryGates,writeReports,fingerprint} from './report.mjs';
const make=(kind='synthetic')=>newReport({project:'inventory-platform',source:{application:'fixture',installation:'test',kind},snapshot:Buffer.from('{}'),commit:'abc',dirty:false});
test('synthetic evidence never certifies retirement',()=>{
 const r=make();for(const gate of mandatoryGates)setGate(r,gate,'PASS',['fixture']);
 assert.equal(finalize(r).readiness,'NOT_READY');assert.equal(r.gates.real_source.status,'NOT_RUN');assert.equal(r.sourceArchivalAuthorized,false);
});
test('all mandatory real-source gates permit owner acceptance only',()=>{
 const r=make('real');for(const gate of mandatoryGates)setGate(r,gate,'PASS',['adapter evidence']);
 assert.equal(finalize(r).readiness,'READY_FOR_OWNER_ACCEPTANCE');assert.equal(r.ownerAcceptance,'NOT_RUN');assert.equal(r.sourceArchivalAuthorized,false);
});
test('review and missing evidence block readiness',()=>{
 assert.throws(()=>setGate(make(),'preflight','PASS'));
 for(const status of ['FAIL','REQUIRES_REVIEW','NOT_RUN']){
 const r=make('real');for(const gate of mandatoryGates)setGate(r,gate,'PASS',['test']);setGate(r,'reconciliation',status);assert.equal(finalize(r).readiness,'NOT_READY');
 }
});
test('reports fingerprint input and refuse to overwrite evidence',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'migration-report-'));
 try{const r=make();await writeReports(r,dir);
 assert.equal(JSON.parse(await readFile(join(dir,'migration-report.json'),'utf8')).snapshot.sha256,fingerprint(Buffer.from('{}')));
 await assert.rejects(writeReports(r,dir));
 assert.match(await readFile(join(dir,'migration-report.md'),'utf8'),/does not authorize/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
