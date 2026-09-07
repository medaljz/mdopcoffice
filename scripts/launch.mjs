import {showOffice,ensureOffice} from '../lib/local-launch.mjs';
try{if(process.argv.includes('--headless'))console.log(await ensureOffice());else await showOffice(undefined,process.argv.includes('--web')?'web':process.argv.includes('--app')?'app':undefined);}catch(e){console.error(e.message);process.exitCode=1;}
