import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation/engine.js';
import { DEFAULTS, validateConfig } from '../src/simulation/config.js';
import { sampleWind, parseField } from '../src/wind/field.js';
import { record, parseRecord, metrics } from '../src/experiments/records.js';
import { Vector3 } from 'three';

test('hover is stable without wind',()=>{const sim=new Simulation({...DEFAULTS,wind:'calm'});for(let i=0;i<4000;i++)assert.equal(sim.step(),true);const s=sim.snapshot();assert.ok(s.position[2]>1.9&&s.position[2]<2.1);assert.ok(s.error<.01);});
test('position controller rejects a side gust',()=>{const sim=new Simulation({...DEFAULTS,wind:'gust',speed:5,direction:90});let max=0;for(let i=0;i<4000;i++){sim.step();max=Math.max(max,sim.snapshot().error);}assert.ok(max<.5);assert.ok(sim.snapshot().error<.03);});
test('fixed seed field is repeatable',()=>{const a=sampleWind(new Vector3(1,2,3),4,{...DEFAULTS,wind:'turbulent',seed:88}),b=sampleWind(new Vector3(1,2,3),4,{...DEFAULTS,wind:'turbulent',seed:88});assert.deepEqual(a.toArray(),b.toArray());});
test('field parser validates and interpolates a real grid',()=>{const f=parseField({schema:'drone-wind-grid-v1',units:'m/s',coordinates:'world-z-up',frame:'fixed-world',source:'test',origin:[0,0,0],spacing:[1,1,1],dimensions:[2,2,2],velocity:Array(24).fill(2)});assert.deepEqual(f.sample(new Vector3(.5,.5,.5)).toArray(),[2,2,2]);assert.equal(f.sample(new Vector3(3,0,0)),null);});
test('record round trip rejects malformed data',()=>{const sim=new Simulation({...DEFAULTS,wind:'calm'});const rows=[sim.snapshot()];for(let i=0;i<20;i++){sim.step();rows.push(sim.snapshot());}const doc=record(DEFAULTS,rows);assert.equal(parseRecord(doc).schema,'drone-experiment-v1');assert.throws(()=>parseRecord({...doc,rows:[]}));assert.ok(metrics(rows,DEFAULTS).max<.01);});
test('config limits protect simulation inputs',()=>{assert.throws(()=>validateConfig({...DEFAULTS,speed:99}));assert.throws(()=>validateConfig({...DEFAULTS,wind:'unknown'}));});
