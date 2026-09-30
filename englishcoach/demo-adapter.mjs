import { defaultState, localDate, sampleItems, parseText } from './core.mjs';
export const STORAGE_KEY = 'englishcoach-public-demo:v1';
export const OCR_RAW = "把这个单独放在旁边可以吗？ | Could I have this on the slde? | | on the side\n我还没有决定。 | I'm still on the fence. | | on the fence\n顺便说一下 | by the way | /baɪ ðə weɪ/ |";
let memorySnapshot = null;
let memoryOnly = false;
export function demoStorageStatus() { return memoryOnly ? 'memory' : 'browser'; }
const REPLIES = ["Here is a practice prompt: try using “on the fence” to describe a small decision. For example: “I’m still on the fence about trying that new café.”","Here is another phrase to try: “Could you clarify…?” Use it to ask a polite follow-up question, such as “Could you clarify which utilities are included in the rent?”","A useful way to keep speaking is: “Let me put it another way…” Write one more version of your idea, then save an expression you would like to practice tomorrow.","Before finishing, choose one expression you want to remember. You can copy this example to your notes: “I’d like to put this into practice tomorrow.”"];
function seedDemo() {
 const state=defaultState(),today=localDate(),before=new Date(`${today}T12:00:00`);before.setDate(before.getDate()-1);const yesterday=localDate(before);
 const prior=sampleItems(yesterday).map((item,i)=>({...item,id:`demo-yesterday-${i}`,learnedDate:yesterday,lastPracticed:yesterday,starred:i===2,history:[{date:yesterday,mode:i%3===0?'review':i%3===1?'scene':'recap',answer:item.en,correct:true,hinted:false}],wrongCount:0}));
 const extra=parseText("我还没有决定。 | I'm still on the fence. | | on the fence\n我们应当考虑不同的选择。 | We should take different options into account. | | take different options into account\n你能详细说明你的建议吗？ | Could you elaborate on your suggestion? | | elaborate on").items.map((item,i)=>({...item,id:`demo-prior-extra-${i}`,createdDate:yesterday,learnedDate:yesterday,lastPracticed:yesterday,sample:true,history:[{date:yesterday,mode:'scene',answer:item.en,correct:true,hinted:false}]}));
 state.items=[...prior,...extra,...sampleItems(today).map((item,i)=>({...item,id:`demo-today-${i}`}))];
 state.sessions[yesterday]={phase:3,notes:'Synthetic practice note: I would like to clarify the details before making a decision.',chatNotes:'A useful expression from this fictional conversation: Let me put it another way.',summary:{learned:'I learned how to ask for clarification and describe everyday preferences.',hard:'Could you elaborate on the available options?',tomorrow:'Tomorrow I would like to practice a polite follow-up question.'},phases:[],chat:{draft:'',messages:[{id:'demo-conversation-1',role:'user',content:'I visited a small café yesterday. The atmosphere was comfortable, and the staff offered a complimentary refill. I asked whether a decaffeinated option was available.'},{id:'demo-conversation-2',role:'assistant',content:'You can practice a polite request: Could I have the sauce on the side? Another useful expression is “on the house”, which means something is provided without an extra charge.'}]}};
 return {state,revision:0,seedDate:today,updatedAt:new Date().toISOString()};
}

export function validDemoSnapshot(value) {
 const state=value?.state;
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
 if(!object(state)||state.schemaVersion!==1||!object(state.settings)||!Array.isArray(state.items)||!object(state.sessions)||!Number.isInteger(value.revision)||value.revision<0)return false;
 const durations=state.settings.durations;
 if(!Array.isArray(durations)||durations.length!==4||durations.some((n,i)=>n!==[10,15,20,15][i]))return false;
 if(state.items.some(item=>!object(item)||typeof item.id!=='string'||typeof item.en!=='string'||typeof item.zh!=='string'||!['word','phrase','sentence','grammar'].includes(item.type)||!Array.isArray(item.history)))return false;
 for(const session of Object.values(state.sessions)){
  if(!object(session)||!Array.isArray(session.phases))return false;
  if(session.phases.some(phase=>!object(phase)||!object(phase.timer)||(phase.quiz!=null&&!Array.isArray(phase.quiz))||(phase.answers!=null&&!object(phase.answers))))return false;
  if(session.chat!=null&&(!object(session.chat)||!Array.isArray(session.chat.messages)||session.chat.messages.some(message=>!object(message)||typeof message.content!=='string'||!['user','assistant'].includes(message.role))))return false;
 }
 return true;
}

export function loadDemoState(){if(memoryOnly)return memorySnapshot||=(seedDemo());let raw;try{raw=localStorage.getItem(STORAGE_KEY);}catch{memoryOnly=true;return memorySnapshot||=(seedDemo());}if(raw){try{const data=JSON.parse(raw);if(validDemoSnapshot(data))return data;}catch{}}return seedDemo();}

export function saveDemoState(state){const previous=loadDemoState();const result={...previous,state,revision:previous.revision+1,updatedAt:new Date().toISOString()};memorySnapshot=result;try{if(!memoryOnly)localStorage.setItem(STORAGE_KEY,JSON.stringify(result));}catch{memoryOnly=true;}return result;}

export function resetDemo(){memorySnapshot=null;try{localStorage.removeItem(STORAGE_KEY);}catch{memoryOnly=true;}}

export async function demoApi(path,data,method='POST'){if(path==='state')return method==='GET'?loadDemoState():saveDemoState(data.state);if(path==='config'||path==='engine')return {configured:true,ready:true,demo:true,model:'预设示例回复',detail:'公开演示未连接模型。',status:'demo'};if(path==='extract')return {...parseText(data.text),mode:'local'};if(path==='chat'){const turn=data?.turn;if(!Number.isSafeInteger(turn)||turn<0)throw new Error('演示对话轮次必须是非负安全整数。');return {reply:REPLIES[turn%REPLIES.length],model:'preset-demo'};}throw new Error('此功能不在静态演示范围内。');}