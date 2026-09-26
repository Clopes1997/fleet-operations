import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
export const statuses=['PASS','FAIL','REQUIRES_REVIEW','NOT_RUN','N/A'];
export const mandatoryGates=['preflight','source_snapshot','isolated_target','import','reconciliation','acceptance','restart_persistence','backup_restore','rollback','real_source'];
export const fingerprint=bytes=>createHash('sha256').update(bytes).digest('hex');
export function newReport({project,source,snapshot,commit,dirty,timestamp=new Date().toISOString()}) {
 if(!['inventory-platform','personal-operations','fleet-operations'].includes(project))throw new Error('Unknown project');
 if(!source||! /^[a-zA-Z0-9_-]{1,64}$/.test(source.application)||! /^[a-zA-Z0-9_-]{1,64}$/.test(source.installation)||!['synthetic','real'].includes(source.kind))throw new Error('Explicit source identity and kind required');
 return {schemaVersion:1,project,executionTimestamp:timestamp,source:{application:source.application,installation:source.installation,kind:source.kind},
 snapshot:{sha256:fingerprint(snapshot),bytes:snapshot.length},target:{commit,dirty:Boolean(dirty)},
 gates:Object.fromEntries(mandatoryGates.map(name=>[name,{status:'NOT_RUN',evidence:[]}])),
 counts:{source:{},target:{}},totals:{source:{},target:{}},identities:[],integrityChecks:[],discrepancies:[],warnings:[],manualReviews:[],automatedTests:[],
 restore:{status:'NOT_RUN'},rollback:{status:'NOT_RUN'},mappingPolicy:{},blockers:[],readiness:'NOT_READY',ownerAcceptance:'NOT_RUN',sourceArchivalAuthorized:false};
}
export function applyProofOfConceptDecision(report) {
 if(!['inventory-platform','fleet-operations'].includes(report.project)||report.source.kind!=='synthetic')throw new Error('Decision only covers synthetic rehearsals of the named proof-of-concept sources');
 report.ownerDecisions={id:'owner-2026-09-26-no-production-data',project:report.project,noProductionData:true,noLegacyProductionDeployment:true};
 report.gates.real_source={status:'N/A',evidence:['Owner decision 2026-09-26: no production data existed; synthetic evidence is not a historical migration']};
 report.legacyVersionRollback={status:'N/A',evidence:['Owner decision 2026-09-26: legacy application was proof of concept with no production data/deployment requiring cross-version rollback']};
}
function validExemption(report,name) {
 return name==='real_source'&&['inventory-platform','fleet-operations'].includes(report.project)&&report.source.kind==='synthetic'
  &&report.ownerDecisions?.id==='owner-2026-09-26-no-production-data'&&report.ownerDecisions.project===report.project
  &&report.ownerDecisions.noProductionData===true&&report.ownerDecisions.noLegacyProductionDeployment===true
  &&report.gates.real_source.evidence?.length>0;
}
export function setGate(report,name,status,evidence=[]) {
 if(!mandatoryGates.includes(name)||!statuses.includes(status))throw new Error('Unknown gate/status');
 if(status==='N/A')throw new Error('N/A requires a scoped owner decision, not a generic gate override');
 if(status==='PASS'&&!evidence.length)throw new Error('PASS requires evidence');
 if(evidence.some(e=>typeof e!=='string'))throw new Error('Use safe evidence labels');
 report.gates[name]={status,evidence};
}
export function finalize(report) {
 if(report.source.kind!=='real'&&!validExemption(report,'real_source'))report.gates.real_source={status:'NOT_RUN',evidence:['Synthetic fixtures do not prove real-source migration']};
 const incomplete=mandatoryGates.filter(name=>report.gates[name]?.status!=='PASS'&&!(report.gates[name]?.status==='N/A'&&validExemption(report,name)));
 report.blockers=[...new Set([...report.blockers,...incomplete.map(name=>name+': '+report.gates[name]?.status)])];
 if(report.target.dirty)report.warnings=[...new Set([...report.warnings,'Dirty working tree does not uniquely identify target execution'])];
 const unresolvedReviews=report.manualReviews.filter(item=>item.status!=='PASS');
 report.readiness=incomplete.length||report.blockers.length||report.discrepancies.length||unresolvedReviews.length||report.target.dirty?'NOT_READY':'READY_FOR_OWNER_ACCEPTANCE';
 report.ownerAcceptance='NOT_RUN';report.sourceArchivalAuthorized=false;return report;
}
const escape=value=>String(value).replaceAll('|','\\|').replaceAll('\n',' ');
export function markdown(report) {
 return '# Migration validation report\n\nReadiness: **'+report.readiness+'**\n\nPassing automated checks does not authorize deletion or archival of the source.\n\nSource: '+
 escape(report.source.application)+' / '+escape(report.source.installation)+' ('+report.source.kind+')\n\nSnapshot SHA-256: '+report.snapshot.sha256+
 '\n\nTarget: '+report.target.commit+'; dirty: '+report.target.dirty+'\n\nExecuted: '+report.executionTimestamp+
 '\n\n| Gate | Status | Evidence |\n| --- | --- | --- |\n'+Object.entries(report.gates).map(([name,g])=>'| '+name+' | '+g.status+' | '+escape(g.evidence.join('; '))+' |').join('\n')+
 '\n\n## Reconciliation\n\n'+JSON.stringify({counts:report.counts,totals:report.totals,integrityChecks:report.integrityChecks},null,2)+
 '\n\n## Review and blockers\n\n'+[...report.blockers,...report.warnings,...report.discrepancies.map(d=>JSON.stringify(d))].map(v=>'- '+escape(v)).join('\n')+
 '\n\n## Mapping, provenance and acceptance evidence\n\n'+JSON.stringify({ownerDecisions:report.ownerDecisions,legacyVersionRollback:report.legacyVersionRollback,identities:report.identities,mappingPolicy:report.mappingPolicy,manualReviews:report.manualReviews,automatedTests:report.automatedTests,restore:report.restore,rollback:report.rollback},null,2)+
 '\n\nOwner acceptance: NOT_RUN. Source archival: not authorized.\n';
}
export async function writeReports(report,output) {
 await mkdir(output,{recursive:true});
 await writeFile(resolve(output,'migration-report.json'),JSON.stringify(finalize(report),null,2)+'\n',{flag:'wx'});
 await writeFile(resolve(output,'migration-report.md'),markdown(report),{flag:'wx'});
}
export async function cli(args,root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')) {
 const options={};
 for(let i=0;i<args.length;i+=2) {
  if(!['--snapshot','--application','--installation','--kind','--out'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Invalid options');
  options[args[i]]=args[i+1];
 }
 if(Object.keys(options).length!==5)throw new Error('All five options required');
 const bytes=await readFile(resolve(options['--snapshot']));
 const project=JSON.parse(await readFile(resolve(root,'package.json'),'utf8')).name;
 const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const dirty=execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim().length>0;
 const report=newReport({project,source:{application:options['--application'],installation:options['--installation'],kind:options['--kind']},snapshot:bytes,commit,dirty});
 try {JSON.parse(bytes.toString('utf8'));setGate(report,'source_snapshot','PASS',['JSON readable; fingerprint recorded; domain validation remains separate']);}
 catch {setGate(report,'source_snapshot','FAIL',['Malformed JSON; contents omitted']);}
 report.warnings.push('Snapshot inspection only: no import, target connection or retirement rehearsal executed');
 await writeReports(report,resolve(options['--out']));
 console.log(report.readiness+': reports written');
 return report.gates.source_snapshot.status==='FAIL'?1:2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.exitCode=await cli(process.argv.slice(2));}
 catch{console.error('Report command failed: check arguments, source readability and an unused output directory. Contents and credentials omitted.');process.exitCode=1;}
}
