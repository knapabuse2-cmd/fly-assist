import {parentPort} from 'node:worker_threads';
import fs from 'node:fs';
import {experiment} from '../core/experiment.mjs';
const bank=JSON.parse(fs.readFileSync(new URL('../public/neural-bank.json',import.meta.url)));
parentPort.postMessage(experiment(bank));
