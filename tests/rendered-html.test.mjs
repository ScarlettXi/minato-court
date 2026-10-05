import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`, { headers:{ accept:"text/html" } }), {
    ASSETS:{ fetch:async () => new Response("Not found", { status:404 }) },
  }, { waitUntil(){}, passThroughOnException(){} });
}

test("renders the account gate without leaking owner dashboard data", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Minato Court/);
  assert.match(html, /正在读取你的账户/);
  assert.doesNotMatch(html, /request-table|confirm-modal|owner@example|test-owner/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/);
});

test("shows platform sign-in and does not present unconfigured OTP forms", async () => {
  const response = await render("/login");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /邮箱登录/);
  assert.match(html, /手机号登录/);
  assert.match(html, /使用现有 ChatGPT 账户进入/);
  assert.match(html, /\/signin-with-chatgpt\?return_to=%2F/);
  assert.match(html, /暂未开放/);
  assert.doesNotMatch(html, /type="email"|发送验证码/);
  assert.doesNotMatch(html, /mc_access=|mc_refresh=/);
});
