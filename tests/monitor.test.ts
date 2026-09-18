import test from 'node:test';
import assert from 'node:assert/strict';
import { latestCsv } from '../src/collectors/setam-resource.js';
import { isOpenLot } from '../src/collectors/status.js';
import { readAllRows } from '../web/lib/pagination.js';

test('СЕТАМ вибирає дату файлу, а не порядок або дату створення ресурсу',()=>{
  assert.deepEqual(latestCsv([
    {url:'https://data.gov.ua/auctions-14-09-2026.csv',format:'CSV',created:'2026-09-18'},
    {url:'https://data.gov.ua/readme.txt',created:'2026-09-20'},
    {url:'https://data.gov.ua/auctions-17-09-2026.csv',format:'CSV',created:'2026-09-01'},
  ]),{url:'https://data.gov.ua/auctions-17-09-2026.csv',date:'2026-09-17T00:00:00.000Z'});
  assert.throws(()=>latestCsv([{url:'https://data.gov.ua/info.pdf'}]),/CSV/);
});

test('активний статус із простроченим дедлайном не є відкритим лотом',()=>{
  const now=Date.parse('2026-09-18T12:00:00Z');
  assert.equal(isOpenLot({source:'prozorro',status:'active_tendering',bids_end:'2026-09-18T12:00:00Z'},now),false);
  assert.equal(isOpenLot({source:'prozorro',status:'complete',bids_end:'2026-09-20'},now),false);
  assert.equal(isOpenLot({source:'prozorro',status:'active_tendering',bids_end:'2026-09-20'},now),true);
  assert.equal(isOpenLot({source:'setam',status:'Реєстрація учасників',bids_end:null},now),true);
});

test('мапа читає понад 1000 рядків навіть якщо сервер повертає менше за запитану сторінку',async()=>{
  const rows=Array.from({length:1205},(_,id)=>({id}));
  const calls:number[]=[];
  const result=await readAllRows<{id:number}>(async(from)=>{
    calls.push(from);return {data:rows.slice(from,from+200),error:null,count:rows.length};
  });
  assert.deepEqual(result,rows);
  assert.deepEqual(calls,[0,200,400,600,800,1000,1200]);
});

test('помилка сторінки не перетворюється на неповну успішну видачу',async()=>{
  await assert.rejects(readAllRows(async(from)=>from===0
    ? {data:[{id:1}],error:null,count:2}
    : {data:null,error:{message:'database unavailable'},count:null}),/database unavailable/);
});
