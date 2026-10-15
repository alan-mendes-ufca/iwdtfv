// Usado pelos testes de integração para montar a URL da API.
// TS: sem anotação de retorno; o TS infere `string` a partir do valor padrão do `||`.
function getOrigin() {
  // TS: `process.env.X` é `string | undefined`; o `||` garante um texto.
  return process.env.WEBSERVER_ORIGIN || "http://localhost:3000";
}

// TS: o tipo de `webserver` é inferido do objeto, ou seja, `{ origin: string }`, sem escrever o tipo.
const webserver = {
  origin: getOrigin(),
};

export default webserver;
