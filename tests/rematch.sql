-- Інтеграційна перевірка у транзакції: всі тестові зміни відкатуються.
begin;
do $$
declare c_id uuid; lot_id uuid; first_match uuid; n integer;
begin
 insert into public.criteria(name,asset_types,keywords) values
 ('QA temporary criterion','{land}','{QA_MONITOR_1205}') returning id into c_id;
 insert into public.lots(source,source_id,title,asset_type,status,bids_end,start_price,current_price,valuation)
 select 'prozorro','QA_MONITOR_'||gen_random_uuid(),'QA_MONITOR_1205','land','active_tendering',now()+interval '1 day',100,100,200
 from generate_series(1,1205);
 perform public.ua_rematch_lots();
 select count(*) into n from public.matches where criteria_id=c_id;
 if n<>1205 then raise exception 'expected 1205 matches, got %',n; end if;
 select m.id,m.lot_id into first_match,lot_id from public.matches m where criteria_id=c_id limit 1;
 update public.matches set notified=true where id=first_match;
 perform public.ua_rematch_lots();
 if not exists(select 1 from public.matches where id=first_match and notified) then
   raise exception 'existing notification state was lost'; end if;
 update public.lots set status='complete' where id=lot_id;
 perform public.ua_rematch_lots(array[lot_id]);
 select count(*) into n from public.matches where criteria_id=c_id;
 if n<>1204 then raise exception 'completed lot retained match'; end if;
 update public.lots set bids_end=now()-interval '1 second' where title='QA_MONITOR_1205';
 perform public.ua_rematch_lots();
 select count(*) into n from public.matches where criteria_id=c_id;
 if n<>0 then raise exception 'expired lots retained matches'; end if;
end;
$$;
rollback;
