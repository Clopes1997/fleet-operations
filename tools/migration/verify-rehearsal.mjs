import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export function verifyRehearsal(report) {
 for(const gate of ['preflight','source_snapshot','isolated_target','import','reconciliation','acceptance','restart_persistence','backup_restore']){
  if(report.gates?.[gate]?.status!=='PASS')throw new Error('Required synthetic rehearsal gate did not pass: '+gate);
 }
 if(report.restore?.status!=='PASS'||report.rollback?.routingRestoration!=='PASS')throw new Error('Restore/rollback execution evidence missing');
 if(report.source.kind!=='synthetic'||report.gates.real_source.status!=='NOT_RUN')throw new Error('Synthetic CI must not claim real-source evidence');
 if(report.readiness!=='NOT_READY'||report.ownerAcceptance!=='NOT_RUN'||report.sourceArchivalAuthorized!==false)throw new Error('Unexpected retirement authorization');
 if(report.target.dirty||report.discrepancies.length)throw new Error('Unreconciled or dirty target');
 return true;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{verifyRehearsal(JSON.parse(await readFile(process.argv[2],'utf8')));console.log('Mandatory synthetic rehearsal evidence passed; real cutover remains unapproved');}
 catch(e){console.error(e.message);process.exitCode=1;}
}
