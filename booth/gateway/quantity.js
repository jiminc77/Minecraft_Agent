import {nativeKoreanToNumber,nativeKoreanNumber,counter,hangulToNumber} from 'hangul-util';
const nativeForms=new Set();
for(let n=1;n<100;n++){nativeForms.add(nativeKoreanNumber(n));nativeForms.add(counter(n,'개').replace(/\s*개$/,''));}
function parse(word){
 if(/^[-+]?\d+(\.\d+)?$/.test(word))return Number(word);
 if(word==='반')return .5;
 if(nativeForms.has(word))return nativeKoreanToNumber(word);
 if(/^[영공일이삼사오육칠팔구십백천만억조]+$/.test(word))return hangulToNumber(word);
 return null;
}
const UNITS={move:['칸'],jump:['번','회'],dig:['개'],turn:['도','바퀴'],look:['도'],attack:['마리'],approach:['마리']};
export function readQuantities(text){
 const quantities=[];
 for(const m of text.matchAll(/([가-힣0-9.+\-\s]+?)(칸|번|회|개|도|마리|바퀴)/g)){
  const tail=text.slice(m.index+m[0].length);
  if(m[2]==='번' && /(?:^|\s)(?:이|저|지난)$/.test(m[1]))continue;
  const prefix=m[1].replace(/\s/g,'');let value=null;
  for(let i=0;i<prefix.length;i++){
   const v=parse(prefix.slice(i));
   if(v!==null){if(i>0&&parse(prefix.slice(0,i))!==null)break;value=v;break;}
  }
  if(m[2]==='도' && value===null && /^[가-힣]/.test(tail))continue;
  quantities.push({unit:m[2],value});
 }
 return quantities;
}
export function checkQuantity(text,action){
 const units=UNITS[action.type];if(!units)return null;
 for(const q of readQuantities(text)){
  if(!units.includes(q.unit))continue;
  if(q.value===null)return '수량을 확실히 읽지 못했어요. 원하는 수량을 숫자로 적어 주세요.';
  const value=q.unit==='바퀴'?q.value*360:q.value;
  const expected=['attack','approach'].includes(action.type)?1:Math.abs(action.amount);
  if(Math.abs(value)!==expected)return '원문의 수량과 해석한 수량이 달라요. 원하는 수량을 숫자로 다시 알려주세요.';
 }
 return null;
}
export function hasVerifiedQuantity(text,action){
 const units={move:['칸'],jump:['번'],dig:['개'],turn:['도','바퀴'],look:['도'],attack:['마리'],approach:['마리']}[action.type]||[];
 return [...text.matchAll(/([가-힣0-9.+\-\s]+?)(칸|번|개|도|마리|바퀴)/g)].some(m=>units.includes(m[2])) && checkQuantity(text,action)===null;
}

export function usesQuantityUnit(text,unit){return [...text.matchAll(/([가-힣0-9.+\-\s]+?)(칸|번|개|도|마리|바퀴)/g)].some(m=>m[2]===unit);}
