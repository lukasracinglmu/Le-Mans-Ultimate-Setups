import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {setupManufacturer,readPreviousSetups} from '../setup-lifecycle.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const extractFunction=(code,name)=>{const start=code.indexOf('function '+name+'(');let depth=0;for(let i=code.indexOf('{',start);start>=0&&i<code.length;i++){if(code[i]==='{')depth++;if(code[i]==='}'&&--depth===0)return code.slice(start,i+1);}throw new Error(name+' not found');};
const source=read('index.html');
const frontend=vm.runInNewContext(source.match(/function classifyVendor\(name\)\{[^\n]+/)[0]+';classifyVendor');
const access=vm.runInNewContext(extractFunction(read('access-worker.js'),'classifyManufacturer')+';classifyManufacturer');
const audit=vm.runInNewContext(read('audit-log.js').match(/function classifyManufacturer\(name\) \{[\s\S]*?\n\}/)[0]+';classifyManufacturer');
const hotfixContext=vm.createContext({});
vm.runInContext(read('ui-hotfix.js').replace(/^import .*;\s*/,'').replace('export default {','const worker = {')+';globalThis.script=HOTFIX_JS;',hotfixContext);
const fallbackLine=hotfixContext.script.split('\n').find(line=>line.trim().startsWith('const classify='));
const fallback=vm.runInNewContext(fallbackLine+';classify');
const classifiers=[['server lifecycle',setupManufacturer],['website',frontend],['injected fallback',fallback],['access audit',access],['audit fallback',audit]];
for(const [label,classify] of classifiers){
 test(label+' recognizes all requested beAlien filename markers',()=>{
   for(const name of ['bA2_Bundle_M4_BAR.zip','bA_Bundle_M4_BAR.zip','bA1_Bundle_M4_BAR.zip','Alpine_Spa_bA2.zip','Alpine-bA1-Spa.zip','Alpine bA Spa.zip','bA.zip','BA2_Bundle.zip','ba1_bundle.zip','Alpine_beAlien.zip','Alpine_BE_ALIEN.zip'])assert.equal(classify(name),'beAlien',name);
 });
 test(label+' does not confuse track names or other manufacturers with bA',()=>{
   for(const name of ['Barcelona.zip','Bahrain.zip','Alpine_base.zip','bA12_Bundle.zip','bA20_Bundle.zip','FoobA1.zip'])assert.equal(classify(name),null,name);
   assert.equal(classify('Alpine_Spa_HYMO.zip'),'HYMO');
   assert.equal(classify('Alpine_Spa_GO.zip'),'GO');
 });
}
test('replacement/outdated selection accepts different beAlien aliases as the same manufacturer',()=>{
 const form=new FormData();form.set('previousSetups',JSON.stringify({action:'outdate',targets:[{name:'Alpine_Spa_bA1.zip',sha:'a'.repeat(40)}]}));
 const result=readPreviousSetups(form,['Alpine_Spa_bA2.zip']);assert.equal(result.action,'outdate');assert.equal(result.error,undefined);
 form.set('previousSetups',JSON.stringify({action:'outdate',targets:[{name:'Alpine_Spa_HYMO.zip',sha:'a'.repeat(40)}]}));
 assert.ok(readPreviousSetups(form,['Alpine_Spa_bA2.zip']).error);
});
