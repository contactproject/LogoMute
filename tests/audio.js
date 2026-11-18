'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let listener; const tones = []; const envelopes = [];
class AudioContextStub {
  constructor() { this.state='running'; this.currentTime=1; this.destination={}; }
  createGain() {
    const node={gain:{value:0,setValueAtTime(v){envelopes.push(v)},exponentialRampToValueAtTime(v){envelopes.push(v)}}, connect(){}, disconnect(){}};
    return node;
  }
  createOscillator() {
    const node={type:'sine',frequency:{value:0,setValueAtTime(v){this.value=v}},connect(){},disconnect(){},start(){tones.push(this.frequency.value)},stop(){},onended:null};
    return node;
  }
}
const chrome={runtime:{onMessage:{addListener(fn){listener=fn}}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','chime.js'),'utf8'), {AudioContext:AudioContextStub,chrome,console});
function send(type,extra={}) {return new Promise(resolve=>{assert.equal(listener({target:'logomute-chime',type,...extra},null,resolve),true)})}
(async()=>{
  assert.equal((await send('PLAY_CHIME')).ok,true);
  assert.deepEqual(tones.slice(0,2),[880,1320]);
  assert.equal((await send('PLAY_COUNTDOWN_BEEP',{secondsRemaining:8})).ok,true);
  assert.equal(tones.at(-1),1075);
  assert.equal((await send('PLAY_COUNTDOWN_BEEP',{secondsRemaining:1})).ok,true);
  assert.equal(tones.at(-1),1450);
  assert(envelopes.some(v=>v>0));
  console.log('PASS: short, local WebAudio confirmation chime and calibration countdown (no voice asset).');
})().catch(e=>{console.error(e);process.exitCode=1});
