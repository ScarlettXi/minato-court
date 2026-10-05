import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {fileURLToPath} from 'node:url';
import {transpileModule,ModuleKind,JsxEmit} from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import test from 'node:test';
registerHooks({
  resolve(specifier,context,next){
    if(specifier==='next/link')return {url:'data:text/javascript,import React from "react";export default function Link({prefetch,...props}){return React.createElement("a",props)}',shortCircuit:true};
    if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier)){
      for(const ext of ['.ts','.tsx'])if(existsSync(new URL(specifier+ext,context.parentURL)))return next(specifier+ext,context);
    }
    return next(specifier,context);
  },
  load(url,context,next){
    if(url.endsWith('.tsx'))return {format:'module',source:transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{module:ModuleKind.ESNext,jsx:JsxEmit.ReactJSX}}).outputText,shortCircuit:true};
    return next(url,context);
  }
});
const {AccountPanel}=await import('../app/account-panel.tsx');
const {SetupGuide}=await import('../app/setup-guide.tsx');
const account={id:'supabase:demo',email:'demo@example.test',phone:null,emailVerified:true,notificationChannel:'email',isOwner:false,provider:'supabase'};
const capabilities={emailLogin:false,phoneLogin:false,emailDelivery:false};
const props={account,capabilities,language:'zh',onAccount(){},onNotifications(){}};
const render=(component,data)=>renderToStaticMarkup(React.createElement(component,data));

test('unconfigured delivery disables email selection and test while showing setup status',()=>{
  const html=render(AccountPanel,props);
  assert.match(html,/<option value="email" disabled="" selected="">邮件提醒（待开通）/);
  assert.match(html,/<button class="account-secondary" disabled="">发送测试邮件/);
  assert.match(html,/邮件服务尚未开通/);
  assert.doesNotMatch(html,/邮件提醒已开启|新用户服务状态/);
});

test('enabled delivery shows truthful receipts and new-user scan readiness',()=>{
  const html=render(AccountPanel,{...props,capabilities:{...capabilities,emailDelivery:true},notifications:{recent:[{kind:'test',status:'sent',createdAt:'2026-10-05 12:00:00',acceptedAt:'2026-10-05 12:00:01'}]}});
  assert.match(html,/邮件提醒已开启/);assert.match(html,/data-status="sent">邮件服务已接收/);
  assert.match(html,/不代表已经进入收件箱/);
  const guide=render(SetupGuide,{...props,hasCourts:true,active:true,scanned:false});
  assert.match(guide,/等待首次或下一次成功扫描/);
  assert.doesNotMatch(guide,/已收到近期成功扫描/);
});

if(process.env.ONBOARDING_PREVIEW_DIR){
  const dir=process.env.ONBOARDING_PREVIEW_DIR;mkdirSync(dir,{recursive:true});
  const body=render(SetupGuide,{...props,hasCourts:true,active:true,scanned:false})+render(AccountPanel,props);
  const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
  writeFileSync(dir+'/index.html','<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Minato Court · 本地演示</title><style>'+css+'body{background:#f7f6f1}main{max-width:1040px;margin:30px auto;padding:0 20px}</style><main><p>本地预览 · 演示账户</p>'+body+'</main></html>');
}
