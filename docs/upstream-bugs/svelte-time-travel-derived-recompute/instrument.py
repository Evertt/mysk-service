# Instruments the Svelte runtime chunk of an unminified build (`vp build --minify false`) in
# `.svelte-kit/output` with counters that `repro.mjs` reads. Run from the app root.
import glob, sys

hits = [p for p in glob.glob('.svelte-kit/output/client/_app/immutable/chunks/*.js')
        if 'var spread_props_handler = {' in open(p).read()]
assert len(hits) == 1, hits
p = hits[0]
s = open(p).read()
reps = [
    ('var rest_props_handler = {',
     'Error.stackTraceLimit=80;globalThis.__c={edb:0,ed:0,ue:0,pr:0};\nvar rest_props_handler = {'),
    ('function execute_derived(derived) {',
     'function execute_derived(derived) {globalThis.__c&&(globalThis.__c.ed++,batch_values!==null&&globalThis.__c.edb++);'),
    ('function update_effect(effect) {', 'function update_effect(effect) {globalThis.__c&&globalThis.__c.ue++;'),
    ('\t#process() {', '\t#process() {globalThis.__c&&globalThis.__c.pr++;'),
    ('''	constructor() {
		if (last_batch === null) first_batch = last_batch = this;''',
     '''	constructor() {this.__stack=new Error().stack;this.__t=performance.now();
		if (last_batch === null) first_batch = last_batch = this;'''),
    ('''		batch_values = /* @__PURE__ */ new Map();
		for (const [source, [value]] of this.current) batch_values.set(source, value);''',
     '''		batch_values = /* @__PURE__ */ new Map();
		if(globalThis.__c){const others=[];for(let b=first_batch;b!==null;b=b.#next)if(b!==this)others.push({id:b.id,age:Math.round(performance.now()-b.__t),fork:b.is_fork,stack:b.__stack.split("\\n").slice(2,40).join("\\n")});(globalThis.__ap??=[]).push({id:this.id,fork:this.is_fork,others,mine:this.__stack.split("\\n").slice(2,40).join("\\n")});}
		for (const [source, [value]] of this.current) batch_values.set(source, value);'''),
]
for a, b in reps:
    assert s.count(a) == 1, a
    s = s.replace(a, b)
open(p, 'w').write(s)
print('instrumented', p)
