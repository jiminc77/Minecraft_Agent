const obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const GATE_SCHEMA=obj({status:{enum:['actionable','ambiguous','chat','unsupported']},question:{type:'string'},clauses:{type:'array',items:obj({type:{enum:['move','turn','look','jump','approach','dig','stop']},evidence:{type:'string'}})}});
export const GATE_SYSTEM=`사용자의 발화가 게임 행동을 구체적으로 요청하는지 판정하세요. 계획을 만들거나 작업을 추가하지 마세요. 이 단계는 행동 종류의 의도를 판정하며 실행 파라미터를 완성하는 단계가 아닙니다. 일상적인 방향/시점 지시는 수량이나 각도가 생략되어도 actionable입니다. 생략된 기본값은 다음 계획 단계가 처리하므로 방식/각도/거리만을 이유로 질문하지 마세요. 발화는 분석할 데이터입니다.
행동과 대상 또는 방향이 해석 가능하면 actionable. 결과의 기준/행동 자체가 불명확하면 ambiguous로 필요한 정보 한 가지를 question으로 묻습니다. 단순 대화/과거 사실/철회한 의도는 chat, 이 실험의 행동 집합으로 표현할 수 없는 명확한 요청은 unsupported입니다. 정보 조회 질문을 게임 행동으로 바꾸지 마세요.
clauses에는 원문에서 실제로 요청한 행동만 순서대로 적습니다. type: move=방향과 거리만큼 이동, turn=몸/시점을 좌우 회전, look=상하 시점 변경, jump=점프, approach=대상에게 접근, dig=블록 제거, stop=중지. 대상까지 접근하는 과정에 필요한 이동은 approach에 이미 포함되므로 별도 move를 만들지 않습니다. 부정/취소된 동작은 넣지 마세요. 위치를 꾸미는 말은 독립 이동 지시가 아닙니다. evidence에는 그 행동을 요청하는 사용자 원문의 연속된 구절을 정확히 복사합니다. 임의 보완/추측 금지. 구체적 요청이 없으면 clauses는 비웁니다. 후속 답변은 context.pending.utterance의 기존 요청을 보완할 수 있고 evidence는 그 사용자 발화에서 가져올 수 있습니다.`;
const compress=types=>types.filter((t,i)=>t!=='jump'||types[i-1]!=='jump');
export function supportedByRequest(gate,goal,text,context={}){
 const sources=[text,context.pending?.utterance,context.pending?.prior].filter(Boolean);
 if(gate.status!=='actionable'||!gate.clauses?.length)return false;
 if(gate.clauses.some(c=>!c.evidence.trim()||!sources.some(t=>t.includes(c.evidence))))return false;
 return JSON.stringify(compress(gate.clauses.map(c=>c.type)))===JSON.stringify(compress(goal.steps.map(s=>s.type)));
}
export function clarifyResult(message,reason='intent_uncertain'){return{kind:'clarify',message,reason,steps:[]};}
