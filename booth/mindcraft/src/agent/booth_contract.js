import Ajv from 'ajv';
export const DIRECTIONS = ['forward','back','left','right','forward_left','forward_right','back_left','back_right'];
const object = properties => ({type:'object', properties, required:Object.keys(properties), additionalProperties:false});
const range = (min,max,integer=false) => ({type:integer?'integer':'number',minimum:min,maximum:max});
const target = {type:'string',minLength:1,maxLength:100};
const action = (type, properties={}) => object({type:{const:type},...properties});
export const ATOMIC_SCHEMA = {anyOf:[
 action('move',{direction:{enum:DIRECTIONS},amount:range(.5,30)}),
 action('turn',{amount:range(-360,360)}),action('look',{amount:range(-90,90)}),
 action('jump',{amount:range(1,10,true)}),action('stop'),
 action('approach',{target}),action('attack',{target}),
 action('dig',{target,amount:range(1,10,true)}),
]};
export const ACTION_SCHEMA={anyOf:[...ATOMIC_SCHEMA.anyOf,action('navigate',{position:object({x:range(-30000000,30000000),y:range(-64,320),z:range(-30000000,30000000)})}),action('sequence',{steps:{type:'array',minItems:2,maxItems:6,items:ATOMIC_SCHEMA}}),action('tree',{target}),action('carve',{target}),action('travel',{direction:{enum:DIRECTIONS},distance:{anyOf:[range(.5,100),{type:'null'}]},jumping:{type:'boolean'}}),action('land',{direction:{enum:DIRECTIONS}})]};
export const PLAN_SCHEMA = {anyOf:[
 object({kind:{const:'execute'},message:{type:'string',minLength:1,maxLength:180},action:ACTION_SCHEMA}),
 object({kind:{enum:['clarify','unavailable']},message:{type:'string',minLength:1,maxLength:180},action:{type:'null'}}),
]};
const ajv = new Ajv({allErrors:true,strict:false});
const validate = ajv.compile(PLAN_SCHEMA);
export function validatePlan(plan, observation) {
 if(!validate(plan)) throw Error('invalid_plan_schema');
 if(plan.kind !== 'execute') return plan;
 const a=plan.action;
 if(a.type==='sequence'){for(const step of a.steps)validatePlan({kind:'execute',message:plan.message,action:step},observation);return plan;}
 if(a.type==='navigate' && (!observation?.pos || Math.hypot(a.position.x-observation.pos.x,a.position.z-observation.pos.z)>101))throw Error('navigation_range');
 if(a.target) {
  const t=observation?.targets?.find(t=>t.key===a.target);
  if(!t) throw Error('target_missing');
  if((['dig','tree','carve'].includes(a.type)) !== (t.kind==='block')) throw Error('target_kind_mismatch');
  if(a.type==='tree' && !t.name.endsWith('_log'))throw Error('not_tree');
  if(a.type==='carve' && !['dirt','grass_block','coarse_dirt','rooted_dirt'].includes(t.name))throw Error('not_earth');
  if(a.type==='attack' && !['pig','cow','sheep','chicken','rabbit'].includes(t.name)) throw Error('unsupported_attack_target');
 }
 return plan;
}
export const sameAction = (a,b) => JSON.stringify(a,Object.keys(a||{}).sort())===JSON.stringify(b,Object.keys(b||{}).sort());
