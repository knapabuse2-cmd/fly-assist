import fs from 'node:fs';
import {experiment} from '../core/experiment.mjs';
const bank=JSON.parse(fs.readFileSync('public/neural-bank.json'));
const report=experiment(bank);
fs.writeFileSync('reports/experiment.json',JSON.stringify(report,null,2));
for(const [policy,r] of Object.entries(report.results))console.log(policy,JSON.stringify({success:r.success,n:r.n,hints:r.hints,reward:r.reward,markedHints:r.markedHints,unmarkedHints:r.unmarkedHints}));
