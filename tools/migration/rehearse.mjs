import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawnSync,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {applyProofOfConceptDecision,newReport,setGate,writeReports,fingerprint} from './report.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),options={};
const args=process.argv.slice(2);
for(let i=0;i<args.length;i+=2){
 if(!['--snapshot','--decisions','--currency','--kind','--out'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Invalid options');
 options[args[i]]=args[i+1];
}
let report,stage='preflight',substage='input',env,compose,project,started=false,output;
function command(executable,args,input){
 const result=spawnSync(executable,args,{cwd:root,env,encoding:'utf8',input,timeout:900000,maxBuffer:64*1024*1024});
 if(result.status!==0){
  const errorClasses=[...new Set((result.stderr??'').match(/\b[A-Za-z]+(?:Error|Exception):/g)??[])];
  report?.warnings.push('Execution diagnostic: '+substage+'; exit '+result.status+'; exception classes '+errorClasses.join(','));
  throw new Error('Execution failed at '+substage);
 }
 return result.stdout;
}
const dc=(args,input)=>command('docker',['compose','--project-name',project,'--file',compose,...args],input);
const manage=args=>dc(['run','--rm','--no-deps','--user','root','backend','python','manage.py',...args]);
async function unusedPort(){
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}
try{
 if(!options['--snapshot']||!options['--out']||!['real','synthetic'].includes(options['--kind'])||! /^[A-Z]{3}$/.test(options['--currency']??''))throw new Error('Required options missing');
 output=resolve(options['--out']);await mkdir(dirname(output),{recursive:true});await mkdir(output,{recursive:false});
 const sourcePath=resolve(options['--snapshot']),bytes=await readFile(sourcePath),source=JSON.parse(bytes);
 report=newReport({project:'fleet-operations',source:{application:source.source,installation:source.installation,kind:options['--kind']},snapshot:bytes,
 commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()});
 report.mappingPolicy={quoteCurrency:options['--currency'],valuationCurrency:'BRL (FIPE source)',timestampInterpretation:'Explicit source offsets required; naive timestamps rejected'};
 await writeFile(resolve(output,'source.json'),bytes,{flag:'wx',mode:0o600});
 const decisionArgs=[];
 if(options['--decisions']){
  const decisions=await readFile(resolve(options['--decisions']));
  await writeFile(resolve(output,'decisions.json'),decisions,{flag:'wx',mode:0o600});
  report.mappingPolicy.decisionsSha256=fingerprint(decisions);decisionArgs.push('--decisions','/rehearsal/decisions.json');
 }
 setGate(report,'source_snapshot','PASS',['Read-only source copy and SHA-256 recorded']);
 if(options['--kind']==='synthetic')applyProofOfConceptDecision(report);
 else {
  report.legacyVersionRollback={status:'REQUIRES_REVIEW',evidence:['Future real installations are outside the owner proof-of-concept exemption']};
  report.manualReviews.push({id:'real-installation-version-boundary',status:'REQUIRES_REVIEW',evidence:'Review actual deployment versions and post-snapshot writes before cutover'});
 }
 if(options['--kind']==='real')setGate(report,'real_source','PASS',['Operator supplied real source; ownership remains subject to review']);
 project='migration-fleet-'+randomUUID().slice(0,8);
 const password=randomBytes(32).toString('hex'),port=await unusedPort();
 env={...process.env,MYSQL_PASSWORD:password,MYSQL_ROOT_PASSWORD:password,DB_PASSWORD:password,
 SECRET_KEY:randomBytes(40).toString('hex'),FLEET_REHEARSAL_PASSWORD:password,DB_HOST:'db',
 CSRF_TRUSTED_ORIGINS:'https://127.0.0.1:'+port,FLEET_REHEARSAL_URL:'https://127.0.0.1:'+port};
 const python=resolve(root,process.platform==='win32'?'apps/api/.venv/Scripts/python.exe':'apps/api/.venv/bin/python');
 substage='temporary-tls';command(python,['tools/migration/tls.py',output]);
 await writeFile(resolve(output,'nginx.conf'),[
 'server { listen 443 ssl; server_name _; ssl_certificate /cert/tls.crt; ssl_certificate_key /cert/tls.key;',
 'root /usr/share/nginx/html; client_max_body_size 5m;',
 'location /api/ { proxy_pass http://backend:8000; proxy_set_header Host $http_host; proxy_set_header X-Forwarded-Proto https; }',
 'location / { try_files $uri $uri/ /index.html; } }'
 ].join('\n'),{flag:'wx'});
 const db={image:'mysql:8.4',environment:['MYSQL_DATABASE=rehearsal_target','MYSQL_USER=rehearsal','MYSQL_PASSWORD','MYSQL_ROOT_PASSWORD'],
 healthcheck:{test:['CMD-SHELL','MYSQL_PWD="$MYSQL_PASSWORD" mysql --protocol=TCP -h 127.0.0.1 -u rehearsal rehearsal_target -e "SELECT 1"'],interval:'3s',timeout:'5s',retries:60}};
 compose=resolve(output,'disposable-compose.json');
 const spec={services:{
 db:{...db,volumes:['target-db:/var/lib/mysql']},restore:{...db,volumes:['restore-db:/var/lib/mysql']},
 backend:{build:{context:resolve(root,'apps/api')},environment:['DB_HOST','DB_NAME=rehearsal_target','DB_USER=rehearsal','DB_PASSWORD','SECRET_KEY','FLEET_REHEARSAL_PASSWORD','FLEET_MIGRATION_DISPOSABLE=1','FLEET_RETIREMENT_FIXTURE=/fixtures/fleet-source.json','CSRF_TRUSTED_ORIGINS','ALLOWED_HOSTS=127.0.0.1,localhost'],
 volumes:[output+':/rehearsal',resolve(root,'tools/migration/fixtures/fleet-source.json')+':/fixtures/fleet-source.json:ro'],depends_on:{db:{condition:'service_healthy'},restore:{condition:'service_healthy'}}},
 web:{build:{context:resolve(root,'apps/web')},ports:['127.0.0.1:'+port+':443'],volumes:[resolve(output,'nginx.conf')+':/etc/nginx/conf.d/default.conf:ro',output+':/cert:ro'],depends_on:['backend']}
 },volumes:{'target-db':{},'restore-db':{}}};
 await writeFile(compose,JSON.stringify(spec,null,2),{flag:'wx',mode:0o600});
 started=true;stage='isolated_target';substage='container-build';dc(['build','backend','web']);
 substage='mysql-start';dc(['up','--detach','--wait','db','restore']);
 substage='clean-migrations';manage(['migrate','--noinput']);manage(['prepare_retirement']);
 setGate(report,'isolated_target','PASS',['Unique Docker volumes; clean Django lineage; MySQL 8.4; TLS and secure session cookies retained']);
 const step=async(name,file)=>{
  substage=name;manage(['migration_rehearsal',name,'--snapshot','/rehearsal/source.json',...decisionArgs,'--out','/rehearsal/'+file]);
  return JSON.parse(await readFile(resolve(output,file),'utf8'));
 };
 stage='preflight';const preflight=await step('preflight','preflight.json');
 report.integrityChecks=preflight.records.map(r=>({key:r.key,status:r.status,classification:r.classification,issues:r.issues}));
 await writeFile(resolve(output,'review-template.json'),JSON.stringify(preflight.reviewTemplate,null,2),{flag:'wx',mode:0o600});
 setGate(report,'preflight',preflight.status,['Deterministic source, plate, identity, precision, timestamp and reference validation; private reusable review template generated']);
 if(preflight.status!=='PASS'){report.discrepancies=report.integrityChecks.filter(r=>r.status!=='PASS');throw new Error('Preflight requires review');}
 stage='import';const imported=await step('import','import.json'),repeated=await step('import','repeat.json');
 if(repeated.imported!==0)throw new Error('Import is not idempotent');
 report.importResult={...imported,repeated};setGate(report,'import','PASS',['Atomic reviewed import; repeat creates zero records; raw provenance preserved']);
 stage='reconciliation';const before=await step('reconcile','reconciliation.json');
 report.counts=before.counts;report.totals=before.totals;report.identities=before.identities;report.discrepancies=before.discrepancies;
 setGate(report,'reconciliation',before.status,['Observed database fields, exact decimal totals, archive state and explicit source offsets compared']);
 if(before.status!=='PASS'){report.manualReviews.push({id:'archival-only-skips',status:'REQUIRES_REVIEW',records:before.archivalOnly});throw new Error('Reconciliation review required');}
 stage='acceptance';substage='mysql-retirement-tests';
 dc(['run','--rm','--no-deps','--user','root','-e','FLEET_TEST_MYSQL=1','-e','DB_USER=root','backend','python','manage.py','test','operations.test_retirement','trucks.tests.test_fipe_retirement','--settings=config.settings_test']);
 report.automatedTests.push({name:'MySQL retirement roles, references, decimals, status history, collisions and controlled FIPE cases',status:'PASS'});
 substage='application-start';dc(['up','--detach','backend','web']);
 // Browser waits for the actual TLS session endpoint; no production cookie/security override.
 substage='browser-retirement';
 command(process.execPath,[resolve(root,'apps/web/node_modules/@playwright/test/cli.js'),'test','--config',resolve(root,'apps/web/playwright.retirement.config.mjs')]);
 report.automatedTests.push({name:'TLS browser sessions, role denial, imported visibility, quote/lifecycle/history and duplicate plate',status:'PASS'});
 setGate(report,'acceptance','PASS',['Dedicated retirement tests against MySQL and actual production-container browser']);
 stage='restart_persistence';substage='restart';dc(['restart','backend']);const restarted=await step('reconcile','restarted.json');
 if(JSON.stringify(restarted.observed)!==JSON.stringify(before.observed))throw new Error('Restart changed imported state');
 setGate(report,'restart_persistence','PASS',['Imported field fingerprints unchanged after application restart']);
 stage='backup_restore';substage='dump';
 const sql=dc(['exec','-T','db','sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot --single-transaction --skip-comments --no-tablespaces rehearsal_target']);
 await writeFile(resolve(output,'target-backup.sql'),sql,{flag:'wx',mode:0o600});
 report.restore={status:'NOT_RUN',backupSha256:fingerprint(Buffer.from(sql))};
 substage='restore-sql';dc(['exec','-T','restore','sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot rehearsal_target'],sql);
 env.DB_HOST='restore';substage='restored-app';dc(['up','--detach','--force-recreate','backend']);dc(['restart','web']);
 const restored=await step('reconcile','restored.json');
 if(restored.status!=='PASS'||JSON.stringify(restored.observed)!==JSON.stringify(before.observed))throw new Error('Restored imported data differs');
 substage='restored-browser';command(process.execPath,[resolve(root,'apps/web/node_modules/@playwright/test/cli.js'),'test','--config',resolve(root,'apps/web/playwright.retirement.config.mjs')]);
 report.restore.status='PASS';setGate(report,'backup_restore','PASS',['SQL restored to separate empty MySQL; exact observed data and secure browser acceptance passed']);
 stage='rollback';env.DB_HOST='db';substage='rollback-app';dc(['up','--detach','--force-recreate','backend']);dc(['restart','web']);
 const rolled=await step('reconcile','rolled-back.json');
 if(rolled.status!=='PASS'||JSON.stringify(rolled.observed)!==JSON.stringify(before.observed))throw new Error('Rollback mismatch');
 report.rollback={status:'PASS',routingRestoration:'PASS',applicationVersion:report.target.commit,reason:'Same-version disposable database routing rollback verified; historical deployment scope recorded separately'};
 setGate(report,'rollback','PASS',['Same-version database routing restored and persisted state compared']);
 if(fingerprint(await readFile(sourcePath))!==report.snapshot.sha256)throw new Error('Source changed');
 report.warnings.push('Only source-linked imported records enter reconciliation totals; browser acceptance creates separate disposable test orders. SQL and raw snapshots remain private.');
}catch{
 if(report){
  if(report.gates[stage]?.status!=='REQUIRES_REVIEW')setGate(report,stage,'FAIL',['Execution failed at '+substage+'; private values and credentials omitted']);
  report.blockers.push('Review or execution incomplete at '+stage);
 }else console.error('Cannot start: require snapshot, explicit currency, kind, and new output directory.');
}finally{
 if(started){try{dc(['down','--volumes','--remove-orphans']);}catch{report?.blockers.push('Disposable cleanup failed; inspect generated Compose file');}}
 if(report){await writeReports(report,output);console.log(report.readiness);process.exitCode=Object.values(report.gates).some(g=>g.status==='FAIL')?1:2;}
 else process.exitCode=1;
}
