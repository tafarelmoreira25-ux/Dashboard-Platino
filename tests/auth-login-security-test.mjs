import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

assert.match(
  html,
  /<form id="login-form"[\s\S]*?autocomplete="on"[\s\S]*?<\/form>/,
  "O login deve ser um formulário explícito reconhecido pelo gerenciador de senhas.",
);
assert.match(
  html,
  /id="login-email"[\s\S]*?autocomplete="username"/,
  "O e-mail deve permitir preenchimento pelo navegador.",
);
assert.match(
  html,
  /id="login-password"[\s\S]*?autocomplete="current-password"/,
  "A senha salva deve poder ser preenchida sem enviar o formulário automaticamente.",
);
assert.match(
  html,
  /id="login-button"[\s\S]*?type="submit"/,
  "O acesso deve depender do envio explícito do formulário.",
);
assert.match(
  html,
  /initializeAuth\(app,\s*\{\s*persistence:\s*inMemoryPersistence\s*\}\)/,
  "A autenticação deve existir apenas em memória e terminar ao atualizar a página.",
);
assert.doesNotMatch(
  html,
  /\bgetAuth\(app\)/,
  "getAuth(app) restauraria a persistência padrão do navegador.",
);
assert.match(
  html,
  /if \(user && !loginAuthorizedForPage\) \{\s*await signOut\(auth\);\s*return;/,
  "Uma sessão restaurada sem envio do login deve ser rejeitada.",
);
assert.match(
  html,
  /loginForm\.addEventListener\("submit",[\s\S]*?loginAuthorizedForPage = true;[\s\S]*?signInWithEmailAndPassword/,
  "Somente uma tentativa explícita deve autorizar a abertura do painel.",
);
assert.match(
  html,
  /window\.logoutPlatino = async function \(\) \{\s*loginAuthorizedForPage = false;[\s\S]*?signOut\(auth\)/,
  "O logout deve invalidar a autorização local antes de encerrar a sessão.",
);
assert.match(
  html,
  /window\.addEventListener\("pageshow",[\s\S]*?event\.persisted[\s\S]*?signOut\(auth\)/,
  "O retorno pelo cache de navegação deve exigir nova autenticação.",
);

console.log("Segurança do login aprovada: senha obrigatória e sessão sem persistência.");
